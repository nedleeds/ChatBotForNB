import os
import sys
import argparse
import json
import numpy as np
import pdfplumber
import faiss
import logging

from sentence_transformers import SentenceTransformer

# pdfminer 관련 로그를 WARNING 이상으로 설정 (INFO나 DEBUG 메시지는 무시)
logging.getLogger("pdfminer").setLevel(logging.WARNING)


def extract_text_from_pdf(path):
    text = ""
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            txt = page.extract_text(x_tolerance=1, y_tolerance=1)
            if txt:
                text += txt + "\n"
    return text


def chunk_text(text, chunk_size=1000, overlap=100):
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunks.append(" ".join(words[i : i + chunk_size]))
        i += chunk_size - overlap
    return chunks


def load_index(dim, index_path):
    if os.path.exists(index_path):
        idx = faiss.read_index(index_path)
        if idx.d != dim:
            return faiss.IndexFlatL2(dim)
        return idx
    return faiss.IndexFlatL2(dim)


def update_metadata(metadata_path, new_entries, chatbot_name):
    """
    metadata_path 아래 JSON 파일이 있으면 로드해서 이어 붙이고,
    없으면 새로운 리스트에 기록. 각 엔트리에는 챗봇 이름도 포함합니다.
    """
    if os.path.exists(metadata_path):
        with open(metadata_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
    else:
        meta = []
    for entry in new_entries:
        entry["chatbot_name"] = chatbot_name
        meta.append(entry)
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--pdf",
        nargs="+",
        required=True,
        help="처리할 PDF 파일 경로들 (여러 개 지정 가능)",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="생성된 인덱스와 메타데이터를 저장할 디렉토리 경로",
    )
    parser.add_argument(
        "--userData", default="/Users/dhl/Library/Application Support/chatbot-for-nb"
    )
    parser.add_argument("--company", default="HD현대로보틱스")
    parser.add_argument("--team", default="로봇소프트웨어개발팀")
    parser.add_argument("--part", default="공통 지원 SW")
    parser.add_argument("--name", required=True, help="생성할 챗봇 이름")
    args = parser.parse_args()

    pdf_paths = args.pdf
    chatbot_name = args.name

    # ── output 인자로 받은 경로를 index_dir로 사용 ──
    index_dir = args.output
    os.makedirs(index_dir, exist_ok=True)

    # ── 임베딩 모델 로드 ──
    model = SentenceTransformer("all-MiniLM-L6-v2")
    dim = 384

    # ── FAISS 인덱스 로드 혹은 생성 ──
    faiss_file = os.path.join(index_dir, "faiss.index")
    index = load_index(dim, faiss_file)

    # ── 메타데이터 로드 ──
    metadata_path = os.path.join(index_dir, "chunk_metadata.json")
    if os.path.exists(metadata_path):
        with open(metadata_path, "r", encoding="utf-8") as f:
            existing_meta = json.load(f)
    else:
        existing_meta = []
    chunk_id_start = len(existing_meta)
    new_meta_entries = []
    current_chunk_id = chunk_id_start

    # ── 여러 PDF 처리 ─────────────────────────────────────────────
    for pdf_path in pdf_paths:
        if not os.path.isfile(pdf_path) or not pdf_path.lower().endswith(".pdf"):
            print(f"❌ '{pdf_path}'는 유효한 PDF 파일이 아닙니다. 건너뜁니다.")
            continue

        print(f"[train_index.py] Processing PDF: {pdf_path}")

        # 1) 텍스트 추출
        text = extract_text_from_pdf(pdf_path)
        if not text.strip():
            print(f"❌ '{pdf_path}'에서 텍스트를 추출하지 못했습니다. 건너뜁니다.")
            continue

        # 2) 텍스트 → 청크 분리
        chunks = chunk_text(text, chunk_size=1000, overlap=100)
        if not chunks:
            print(f"❌ '{pdf_path}' → 청크 생성 실패. 건너뜁니다.")
            continue

        # 3) 임베딩 생성
        embeddings = model.encode(chunks, convert_to_numpy=True)
        embeddings = np.array(embeddings, dtype="float32")
        if embeddings.ndim == 1:
            embeddings = embeddings.reshape(1, -1)

        # 4) FAISS 인덱스에 추가
        index.add(embeddings)

        # 5) 각 청크에 대해 메타데이터 추가
        for chunk in chunks:
            new_meta_entries.append(
                {
                    "chunk_id": current_chunk_id,
                    "source": os.path.basename(pdf_path),
                    "text_preview": chunk[:100],
                }
            )
            current_chunk_id += 1

    # ──────────────────────────────────────────────

    # ── FAISS 인덱스 저장 ──
    faiss.write_index(index, faiss_file)
    print(f"[train_index.py] FAISS index saved: {faiss_file}")

    # ── 메타데이터 저장 (챗봇 이름 포함) ──
    update_metadata(metadata_path, new_meta_entries, chatbot_name)
    print(f"[train_index.py] Metadata updated: {metadata_path}")

    print("[train_index.py] 학습(인덱스 생성/업데이트) 완료")
    sys.exit(0)


if __name__ == "__main__":
    main()
