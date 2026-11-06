import base64
import io
import unittest
from PIL import Image
from api.editor_catalog import normalize_editor_catalog


def gif_data(size=(12,8), count=2):
    frames=[Image.new("RGB",size,(i*31%256,i*79%256,i*127%256)) for i in range(count)]
    out=io.BytesIO()
    frames[0].save(out,format="GIF",save_all=True,append_images=frames[1:],duration=90,loop=0,optimize=False)
    return "data:image/gif;base64,"+base64.b64encode(out.getvalue()).decode()


def catalog(content,style=None):
    item={"id":"animated","name":"Animated","kind":"gif","content":content,"visible":True}
    if style is not None: item["style"]=style
    return {"stickers":[item],"texts":[]}


class GifCatalogTests(unittest.TestCase):
    def test_animation_bytes_survive_and_effect_defaults_are_disabled(self):
        content=gif_data()
        item=normalize_editor_catalog(catalog(content))["stickers"][0]
        self.assertEqual(item["content"],content)
        self.assertEqual(item["kind"],"gif")
        self.assertEqual(item["style"],{"size":18,"shadow":"none","outlineWidth":0})
        image=Image.open(io.BytesIO(base64.b64decode(item["content"].split(",")[1])))
        self.assertEqual(image.n_frames,2)

    def test_actual_gif_required_not_just_header(self):
        for raw in (b"not a gif",b"GIF89a",b""):
            with self.subTest(raw=raw),self.assertRaises(ValueError):
                normalize_editor_catalog(catalog("data:image/gif;base64,"+base64.b64encode(raw).decode()))
        out=io.BytesIO(); Image.new("RGB",(4,4)).save(out,format="PNG")
        with self.assertRaises(ValueError):
            normalize_editor_catalog(catalog("data:image/gif;base64,"+base64.b64encode(out.getvalue()).decode()))

    def test_limit_dimensions_frames_and_total_decoded_pixels(self):
        for size,count in (((1025,2),2),((3,3),101),((800,800),63)):
            with self.subTest(size=size,count=count),self.assertRaises(ValueError):
                normalize_editor_catalog(catalog(gif_data(size,count)))

    def test_gif_rejects_still_image_mime_and_effects(self):
        with self.assertRaises(ValueError):
            normalize_editor_catalog(catalog(gif_data().replace("image/gif","image/png")))
        for style in ({"shadow":"soft"},{"shadow":"glow"},{"outlineWidth":1}):
            with self.subTest(style=style),self.assertRaises(ValueError):
                normalize_editor_catalog(catalog(gif_data(),style))
        style={"size":24,"opacity":50,"rotation":90,"shadow":"none","outlineWidth":0}
        self.assertEqual(normalize_editor_catalog(catalog(gif_data(),style))["stickers"][0]["style"],style)

if __name__ == "__main__": unittest.main()
