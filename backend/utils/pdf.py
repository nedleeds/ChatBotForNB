# utils/pdf.py
import os

from typing import List
from pdf2image import convert_from_path
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_core.documents.base import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter


# (1) 업로드된 파일을 바이너리로 받아서 디스크에 저장 (변경 없음)
def save_uploadedfile(file_bytes: bytes, filename: str) -> str:
    temp_dir = os.path.join(os.path.dirname(__file__), "../data/pdf2img")
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, filename)
    with open(file_path, "wb") as f:
        f.write(file_bytes)
    return file_path


# (2) PyMuPDFLoader를 통해 Document(페이지 단위) 리스트로 변환 후, 각 페이지를 작은 청크로 분할
def pdf_to_documents(pdf_path: str) -> List[Document]:
    # 1) PDF 전체를 페이지별 Document로 로드
    loader = PyMuPDFLoader(pdf_path)
    raw_page_docs = loader.load()  # 기본적으로 페이지 단위 Document 리스트

    # 2) 텍스트 청크 크기/오버랩 설정 (한글 기준 약 800자 ↔ 약 400~450토큰)
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=700, chunk_overlap=200)

    docs: List[Document] = []
    for page_doc in raw_page_docs:
        # page_doc.page_content에는 해당 페이지의 전체 텍스트가 들어 있음
        # page_doc.metadata에는 'source'? 'file_path'? 등 정보가 있음
        page_number = page_doc.metadata.get("page_number", None)
        # 청크 분할: 이 페이지를 chunk_size/overlap 기준으로 잘게 나눔
        chunks = text_splitter.split_documents([page_doc])
        for chunk in chunks:
            # 메타데이터에 원본 파일 경로와 페이지 번호를 확실히 넣어둠
            chunk.metadata["file_path"] = pdf_path
            if page_number is not None:
                chunk.metadata["page"] = page_number
            docs.append(chunk)

    return docs


# (3) PDF → 페이지별 이미지 변환 (변경 없음)
#
def convert_pdf_to_images(pdf_path: str, output_dir: str) -> List[str]:
    """
    PDF 파일을 페이지별로 PNG 이미지로 변환하여 output_dir 에 저장합니다.
    - pdf_path: 변환할 PDF 파일 경로
    - output_dir: 변환된 이미지가 저장될 디렉터리
    반환값: 생성된 이미지 파일 경로 리스트 (예: [".../page_1.png", "…/page_2.png", ...])
    """

    if not os.path.isfile(pdf_path):
        raise FileNotFoundError(f"PDF 파일을 찾을 수 없습니다: {pdf_path}")

    os.makedirs(output_dir, exist_ok=True)

    # DPI 고정 (정수)
    dpi = 450

    # pdf2image의 convert_from_path를 사용해 페이지별 PIL.Image 리스트 생성
    images = convert_from_path(pdf_path, dpi=dpi)

    saved_paths: List[str] = []
    for idx, img in enumerate(images):
        page_no = idx + 1
        img_filename = f"page_{page_no}.png"
        img_path = os.path.join(output_dir, img_filename)

        # PIL Image 객체를 PNG로 저장
        img.save(img_path, "PNG")
        saved_paths.append(img_path)

    return saved_paths
