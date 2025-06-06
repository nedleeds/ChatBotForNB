# utils/pdf.py

import os
import fitz  # PyMuPDF
from typing import List

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
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=700,
        chunk_overlap=200
    )

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
def convert_pdf_to_images(pdf_path: str, dpi: int = 250) -> List[str]:
    doc = fitz.open(pdf_path)
    output_folder = os.path.join(os.path.dirname(__file__), "../data/pdf2img")
    os.makedirs(output_folder, exist_ok=True)

    image_paths = []
    pdf_basename = os.path.splitext(os.path.basename(pdf_path))[0]
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        image_filename = f"{pdf_basename}_page_{page_num + 1}.png"
        image_path = os.path.join(output_folder, image_filename)
        pix.save(image_path)
        image_paths.append(image_path)
    return image_paths
