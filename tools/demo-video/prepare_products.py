"""BG60K zip에서 시연용 제품 사진을 꺼내 진짜 PNG로 저장한다.

BG60K 파일 중 일부는 확장자만 .png이고 실제로는 JPEG라서, Pillow로 다시 저장한다.
기본 ID는 2026-11-16 영상에 쓴 4장이다 (모두 검색 대상 test 1,266장 밖).

사용 (Pillow가 있는 파이썬, 예: CLIP-AdStyle의 .venv):
  ../CLIP-AdStyle/.venv/bin/python tools/demo-video/prepare_products.py \
      --zip "../bg60k_imgs_4.zip"
  # 다른 사진: --ids 2774 34054 ...  (zip 안 경로 bg60k_imgs_4/<id>.png)
"""

import argparse
from pathlib import Path
import zipfile
import io

from PIL import Image

DEFAULT = {"2774": "running-shoe", "34054": "watch", "53904": "cream", "51894": "sunglasses"}


def main():
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--zip", required=True, type=Path, help="bg60k_imgs_4.zip 경로")
    parser.add_argument("--ids", nargs="*", default=list(DEFAULT), help="꺼낼 이미지 ID")
    parser.add_argument("--out", type=Path, default=here / "products")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.zip) as z:
        prefix = Path(args.zip).stem  # bg60k_imgs_4
        for image_id in args.ids:
            data = z.read(f"{prefix}/{image_id}.png")
            name = f"{image_id}-{DEFAULT[image_id]}.png" if image_id in DEFAULT else f"{image_id}.png"
            Image.open(io.BytesIO(data)).convert("RGB").save(args.out / name, "PNG")
            print(args.out / name)


if __name__ == "__main__":
    main()
