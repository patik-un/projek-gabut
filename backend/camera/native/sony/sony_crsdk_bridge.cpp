#include <algorithm>
#include <chrono>
#include <cctype>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <future>
#include <iostream>
#include <mutex>
#include <memory>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include "CameraRemote_SDK.h"
#include "CrCommandData.h"
#include "CrImageDataBlock.h"
#include "IDeviceCallback.h"

namespace fs = std::filesystem;

namespace {

std::mutex callback_mutex;
std::shared_ptr<std::promise<void>> connection_promise;
std::shared_ptr<std::promise<void>> download_promise;
bool connected = false;
std::string downloaded_file;

bool is_connected()
{
    std::lock_guard<std::mutex> lock(callback_mutex);
    return connected;
}

bool path_is_regular_file(const fs::path& path)
{
    if (path.empty()) return false;
    std::error_code error;
    return fs::is_regular_file(path, error) && !error;
}

void mark_disconnected()
{
    std::lock_guard<std::mutex> lock(callback_mutex);
    connected = false;
}

void clear_connection_promise(const std::shared_ptr<std::promise<void>>& promise)
{
    std::lock_guard<std::mutex> lock(callback_mutex);
    if (connection_promise == promise) connection_promise.reset();
}

void clear_download_promise(const std::shared_ptr<std::promise<void>>& promise)
{
    std::lock_guard<std::mutex> lock(callback_mutex);
    if (download_promise == promise) download_promise.reset();
}

std::string json_escape(const std::string& value)
{
    std::ostringstream output;
    for (unsigned char ch : value) {
        switch (ch) {
            case '\\': output << "\\\\"; break;
            case '"': output << "\\\""; break;
            case '\n': output << "\\n"; break;
            case '\r': output << "\\r"; break;
            case '\t': output << "\\t"; break;
            default:
                if (ch < 0x20) {
                    output << "\\u00";
                    const char* hex = "0123456789abcdef";
                    output << hex[(ch >> 4) & 0xf] << hex[ch & 0xf];
                } else {
                    output << ch;
                }
        }
    }
    return output.str();
}

std::string json_string(const std::string& input, const std::string& key)
{
    const std::string marker = "\"" + key + "\"";
    const auto key_pos = input.find(marker);
    if (key_pos == std::string::npos) return "";

    auto pos = input.find(':', key_pos + marker.size());
    if (pos == std::string::npos) return "";
    pos = input.find('"', pos + 1);
    if (pos == std::string::npos) return "";

    std::string value;
    bool escaped = false;
    for (++pos; pos < input.size(); ++pos) {
        const char ch = input[pos];
        if (escaped) {
            switch (ch) {
                case 'n': value.push_back('\n'); break;
                case 'r': value.push_back('\r'); break;
                case 't': value.push_back('\t'); break;
                default: value.push_back(ch); break;
            }
            escaped = false;
        } else if (ch == '\\') {
            escaped = true;
        } else if (ch == '"') {
            return value;
        } else {
            value.push_back(ch);
        }
    }
    return "";
}

void success(const std::string& fields = "")
{
    std::cout << "{\"success\":true";
    if (!fields.empty()) std::cout << "," << fields;
    std::cout << "}" << std::endl;
}

int failure(const std::string& message)
{
    std::cout << "{\"success\":false,\"message\":\"" << json_escape(message) << "\"}" << std::endl;
    return 0;
}

std::string base64_encode(const std::vector<std::uint8_t>& data)
{
    static const char alphabet[] =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string output;
    output.reserve(((data.size() + 2) / 3) * 4);

    for (std::size_t i = 0; i < data.size(); i += 3) {
        const std::uint32_t a = data[i];
        const std::uint32_t b = i + 1 < data.size() ? data[i + 1] : 0;
        const std::uint32_t c = i + 2 < data.size() ? data[i + 2] : 0;
        const std::uint32_t value = (a << 16) | (b << 8) | c;
        output.push_back(alphabet[(value >> 18) & 0x3f]);
        output.push_back(alphabet[(value >> 12) & 0x3f]);
        output.push_back(i + 1 < data.size() ? alphabet[(value >> 6) & 0x3f] : '=');
        output.push_back(i + 2 < data.size() ? alphabet[value & 0x3f] : '=');
    }
    return output;
}

class DeviceCallback final : public SCRSDK::IDeviceCallback
{
public:
    void OnConnected(SCRSDK::DeviceConnectionVersioin) override
    {
        std::shared_ptr<std::promise<void>> promise;
        {
            std::lock_guard<std::mutex> lock(callback_mutex);
            connected = true;
            promise = std::move(connection_promise);
        }
        if (promise) {
            try {
                promise->set_value();
            } catch (const std::future_error&) {
            }
        }
    }

    void OnError(CrInt32u error) override
    {
        std::shared_ptr<std::promise<void>> promise;
        {
            std::lock_guard<std::mutex> lock(callback_mutex);
            promise = std::move(connection_promise);
        }
        if (promise) {
            try {
                promise->set_exception(
                    std::make_exception_ptr(
                        std::runtime_error("connection error " + std::to_string(error))
                    )
                );
            } catch (const std::future_error&) {
            }
        }
    }

    void OnDisconnected(CrInt32u) override
    {
        std::lock_guard<std::mutex> lock(callback_mutex);
        connected = false;
    }

    void OnCompleteDownload(CrChar* filename, CrInt32u) override
    {
        std::string path = filename ? filename : "";
        std::string extension = fs::path(path).extension().string();
        std::transform(
            extension.begin(),
            extension.end(),
            extension.begin(),
            [](unsigned char ch) { return static_cast<char>(std::tolower(ch)); }
        );
        if (extension != ".jpg" && extension != ".jpeg") return;

        std::shared_ptr<std::promise<void>> promise;
        {
            std::lock_guard<std::mutex> lock(callback_mutex);
            downloaded_file = path;
            promise = std::move(download_promise);
        }
        if (promise) {
            try {
                promise->set_value();
            } catch (const std::future_error&) {
            }
        }
    }

    void OnNotifyContentsTransfer(CrInt32u, SCRSDK::CrContentHandle, CrChar*) override {}
    void OnWarning(CrInt32u) override {}
    void OnWarningExt(CrInt32u, CrInt32, CrInt32, CrInt32) override {}
    void OnLvPropertyChanged() override {}
    void OnLvPropertyChangedCodes(CrInt32u, CrInt32u*) override {}
    void OnPropertyChanged() override {}
    void OnPropertyChangedCodes(CrInt32u, CrInt32u*) override {}
};

class CameraSession
{
public:
    ~CameraSession()
    {
        {
            std::lock_guard<std::mutex> lock(callback_mutex);
            connection_promise.reset();
            download_promise.reset();
        }
        if (is_connected() && handle_) SCRSDK::Disconnect(handle_);
        if (handle_) SCRSDK::ReleaseDevice(handle_);
        mark_disconnected();
        if (enum_info_) enum_info_->Release();
        if (initialized_) SCRSDK::Release();
    }

    bool enumerate(std::string& error)
    {
        if (is_connected() && handle_) return true;

        if (handle_) {
            SCRSDK::ReleaseDevice(handle_);
            handle_ = 0;
            mark_disconnected();
        }

        if (!initialized_) {
            initialized_ = SCRSDK::Init();
            if (!initialized_) {
                error = "Sony Camera Remote SDK gagal diinisialisasi";
                return false;
            }
        }

        if (enum_info_) {
            enum_info_->Release();
            enum_info_ = nullptr;
            camera_info_ = nullptr;
        }
        const auto result = SCRSDK::EnumCameraObjects(&enum_info_, 3);
        if (result || !enum_info_ || enum_info_->GetCount() == 0) {
            error = "Kamera Sony tidak ditemukan. Aktifkan USB Remote Shooting.";
            return false;
        }

        camera_info_ = const_cast<SCRSDK::ICrCameraObjectInfo*>(
            enum_info_->GetCameraObjectInfo(0)
        );
        model_ = camera_info_->GetModel() ? camera_info_->GetModel() : "Sony camera";
        return true;
    }

    bool connect(const fs::path& save_dir, std::string& error)
    {
        if (is_connected() && handle_) return set_save_dir(save_dir, error);

        if (!camera_info_) {
            error = "Informasi kamera Sony tidak tersedia";
            return false;
        }
        if (camera_info_->GetSSHsupport() == SCRSDK::CrSSHsupport_ON) {
            error = "Bridge saat ini mendukung koneksi USB tanpa autentikasi SSH";
            return false;
        }

        auto promise = std::make_shared<std::promise<void>>();
        auto future = promise->get_future();
        {
            std::lock_guard<std::mutex> lock(callback_mutex);
            connection_promise = promise;
        }

        const auto result = SCRSDK::Connect(
            camera_info_,
            &callback_,
            &handle_,
            SCRSDK::CrSdkControlMode_Remote,
            SCRSDK::CrReconnecting_OFF,
            "",
            "",
            "",
            0
        );
        if (result) {
            clear_connection_promise(promise);
            if (handle_) {
                SCRSDK::ReleaseDevice(handle_);
                handle_ = 0;
            }
            mark_disconnected();
            error = "Gagal menghubungkan kamera Sony: " + std::to_string(result);
            return false;
        }

        if (future.wait_for(std::chrono::seconds(8)) != std::future_status::ready) {
            clear_connection_promise(promise);
            if (handle_) {
                SCRSDK::Disconnect(handle_);
                SCRSDK::ReleaseDevice(handle_);
                handle_ = 0;
                mark_disconnected();
            }
            error = "Timeout saat menghubungkan kamera Sony";
            return false;
        }
        try {
            future.get();
        } catch (const std::exception& exception) {
            if (handle_) {
                SCRSDK::ReleaseDevice(handle_);
                handle_ = 0;
                mark_disconnected();
            }
            error = exception.what();
            return false;
        }

        return set_save_dir(save_dir, error);
    }

    bool set_save_dir(const fs::path& save_dir, std::string& error)
    {
        if (!handle_) {
            error = "Handle kamera Sony belum tersedia";
            return false;
        }

        std::error_code directory_error;
        fs::create_directories(save_dir, directory_error);
        if (directory_error) {
            error = "Gagal menyiapkan folder download Sony: " + directory_error.message();
            return false;
        }
        std::string path = save_dir.string();
        std::string prefix = "event_booth";
        const auto save_result = SCRSDK::SetSaveInfo(
            handle_,
            path.data(),
            prefix.data(),
            -1
        );
        if (save_result) {
            error = "Gagal mengatur folder download kamera Sony: " + std::to_string(save_result);
            return false;
        }
        return true;
    }

    bool preview(std::vector<std::uint8_t>& jpeg, std::string& error)
    {
        SCRSDK::CrImageInfo image_info;
        auto result = SCRSDK::GetLiveViewImageInfo(handle_, &image_info);
        if (result || image_info.GetBufferSize() == 0) {
            error = "Live view Sony belum tersedia";
            return false;
        }

        std::vector<std::uint8_t> buffer(image_info.GetBufferSize());
        SCRSDK::CrImageDataBlock image_data;
        image_data.SetData(buffer.data());
        image_data.SetSize(static_cast<CrInt32u>(buffer.size()));
        result = SCRSDK::GetLiveViewImage(handle_, &image_data);
        if (result || image_data.GetImageSize() == 0) {
            error = "Gagal mengambil live view Sony: " + std::to_string(result);
            return false;
        }

        jpeg.assign(
            image_data.GetImageData(),
            image_data.GetImageData() + image_data.GetImageSize()
        );
        return true;
    }

    bool capture(const fs::path& output_path, std::string& error)
    {
        if (!set_save_dir(output_path.parent_path(), error)) return false;

        auto promise = std::make_shared<std::promise<void>>();
        auto future = promise->get_future();
        {
            std::lock_guard<std::mutex> lock(callback_mutex);
            downloaded_file.clear();
            download_promise = promise;
        }

        auto result = SCRSDK::SendCommand(
            handle_,
            SCRSDK::CrCommandId_Release,
            SCRSDK::CrCommandParam_Down
        );
        if (!result) {
            std::this_thread::sleep_for(std::chrono::milliseconds(80));
            result = SCRSDK::SendCommand(
                handle_,
                SCRSDK::CrCommandId_Release,
                SCRSDK::CrCommandParam_Up
            );
        }
        if (result) {
            clear_download_promise(promise);
            error = "Shutter Sony gagal: " + std::to_string(result);
            return false;
        }

        if (future.wait_for(std::chrono::seconds(30)) != std::future_status::ready) {
            clear_download_promise(promise);
            error = (
                "Foto diambil tetapi JPEG tidak diterima dalam 30 detik. "
                "Pastikan format kamera JPEG atau RAW+JPEG."
            );
            return false;
        }

        fs::path source;
        {
            std::lock_guard<std::mutex> lock(callback_mutex);
            source = downloaded_file;
        }
        if (!path_is_regular_file(source)) {
            const auto candidate = output_path.parent_path() / source.filename();
            if (path_is_regular_file(candidate)) source = candidate;
        }
        if (!path_is_regular_file(source)) {
            error = "Callback download Sony tidak menghasilkan file";
            return false;
        }

        std::error_code ec;
        fs::create_directories(output_path.parent_path(), ec);
        if (ec) {
            error = "Gagal menyiapkan folder hasil Sony: " + ec.message();
            return false;
        }
        fs::rename(source, output_path, ec);
        if (ec) {
            ec.clear();
            fs::copy_file(source, output_path, fs::copy_options::overwrite_existing, ec);
        }
        if (ec || !path_is_regular_file(output_path)) {
            error = "Gagal memindahkan hasil foto Sony: " + ec.message();
            return false;
        }
        return true;
    }

    const std::string& model() const { return model_; }

private:
    bool initialized_ = false;
    SCRSDK::ICrEnumCameraObjectInfo* enum_info_ = nullptr;
    SCRSDK::ICrCameraObjectInfo* camera_info_ = nullptr;
    SCRSDK::CrDeviceHandle handle_ = 0;
    DeviceCallback callback_;
    std::string model_;
};

}  // namespace

void handle_request(CameraSession& session, const std::string& input)
{
    const std::string command = json_string(input, "command");

    std::string error;
    if (!session.enumerate(error)) {
        failure(error);
        return;
    }

    const std::string output_value = json_string(input, "output_path");
    fs::path work_dir = output_value.empty()
        ? fs::temp_directory_path() / "event-booth-sony-preview"
        : fs::path(output_value).parent_path();
    if (!session.connect(work_dir, error)) {
        failure(error);
        return;
    }

    if (command == "status") {
        success(
            "\"connected\":true,\"message\":\"Kamera Sony ditemukan\",\"camera\":{\"model\":\"" +
            json_escape(session.model()) +
            "\"},\"capabilities\":{\"preview\":true,\"capture\":true,\"settings\":false}"
        );
        return;
    }

    if (command == "preview") {
        std::vector<std::uint8_t> jpeg;
        if (!session.preview(jpeg, error)) {
            failure(error);
            return;
        }
        success("\"image_base64\":\"" + base64_encode(jpeg) + "\"");
        return;
    }

    if (command == "capture") {
        if (output_value.empty()) {
            failure("output_path wajib diisi");
            return;
        }
        if (!session.capture(output_value, error)) {
            failure(error);
            return;
        }
        success("\"output_path\":\"" + json_escape(output_value) + "\"");
        return;
    }

    if (command == "settings") {
        success("\"message\":\"Pengaturan Sony belum dipetakan; nilai kamera dipertahankan\"");
        return;
    }

    failure("Perintah bridge Sony tidak dikenal: " + command);
}

int main(int argc, char** argv)
{
    CameraSession session;

    if (argc > 1 && std::string(argv[1]) == "--server") {
        std::string input;
        while (std::getline(std::cin, input)) {
            handle_request(session, input);
        }
        return 0;
    }

    std::ostringstream input_stream;
    input_stream << std::cin.rdbuf();
    handle_request(session, input_stream.str());
    return 0;
}
