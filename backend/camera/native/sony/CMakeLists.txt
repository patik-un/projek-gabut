cmake_minimum_required(VERSION 3.21)
project(event_booth_sony_crsdk_bridge LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED YES)
set(CMAKE_CXX_EXTENSIONS NO)
set(CMAKE_OSX_DEPLOYMENT_TARGET "12.1" CACHE STRING "Minimum macOS version")
set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "macOS architectures")

set(CRSDK_DIR "${CMAKE_CURRENT_SOURCE_DIR}/vendor/crsdk")
set(CRSDK_HEADERS "${CMAKE_CURRENT_SOURCE_DIR}/vendor/CRSDK")

add_executable(event-booth-sony-crsdk-bridge sony_crsdk_bridge.cpp)
target_include_directories(event-booth-sony-crsdk-bridge PRIVATE "${CRSDK_HEADERS}")
target_link_libraries(event-booth-sony-crsdk-bridge PRIVATE "${CRSDK_DIR}/libCr_Core.dylib")
set_target_properties(event-booth-sony-crsdk-bridge PROPERTIES BUILD_RPATH "@executable_path")

add_custom_command(TARGET event-booth-sony-crsdk-bridge POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CRSDK_DIR}"
        "$<TARGET_FILE_DIR:event-booth-sony-crsdk-bridge>"
    COMMAND ${CMAKE_COMMAND} -E make_directory
        "$<TARGET_FILE_DIR:event-booth-sony-crsdk-bridge>/Contents/Frameworks/CrAdapter"
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CRSDK_DIR}/CrAdapter"
        "$<TARGET_FILE_DIR:event-booth-sony-crsdk-bridge>/Contents/Frameworks/CrAdapter"
    COMMAND ${CMAKE_COMMAND} -E rm -rf
        "$<TARGET_FILE_DIR:event-booth-sony-crsdk-bridge>/CrAdapter"
)
