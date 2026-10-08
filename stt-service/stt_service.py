"""Local STT HTTP service for HabitPulse.

Runs Qwen3-ASR-0.6B on the local GPU and exposes a small HTTP API:

    GET  /health      -> service/model status
    POST /transcribe  -> { audio_base64, audio_format, language? }

The HabitPulse Node server forwards mobile recordings here, so the phone
never needs to run the model itself.
"""

import base64
import io
import os
import tempfile
import threading
import traceback
from contextlib import asynccontextmanager
from pathlib import Path

import torch
import av
import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODEL_PATH = os.environ.get("QWEN_ASR_MODEL_PATH", r"D:\models\Qwen3-ASR-0.6B")
DEVICE = os.environ.get("QWEN_ASR_DEVICE", "cuda:0")

SUPPORTED_FORMATS = {
    "wav", "mp3", "m4a", "aac", "flac", "ogg", "oga", "opus", "webm", "amr", "3gp",
}

_infer_lock = threading.Lock()
_model = None
_device_used = None
_error_log = Path(__file__).resolve().parent / "stt-error.log"


def log_error(message: str) -> None:
    try:
        with open(_error_log, "a", encoding="utf-8") as handle:
            handle.write(message.rstrip() + "\n")
    except OSError:
        pass


def get_model():
    global _model, _device_used
    if _model is None:
        from qwen_asr import Qwen3ASRModel

        if not Path(MODEL_PATH).exists():
            raise RuntimeError(
                f"Model directory not found: {MODEL_PATH}. "
                "Set QWEN_ASR_MODEL_PATH or download the model first."
            )
        device = DEVICE
        dtype = torch.bfloat16 if device.startswith("cuda") else torch.float32
        _model = Qwen3ASRModel.from_pretrained(
            MODEL_PATH,
            dtype=dtype,
            device_map=device,
            max_new_tokens=256,
        )
        _device_used = device
    return _model


def decode_to_wav_16k(raw: bytes) -> bytes:
    # soundfile/libsndfile cannot decode AAC/M4A on Windows, so every upload
    # is decoded through PyAV (bundled ffmpeg) to 16 kHz mono PCM WAV.
    container = av.open(io.BytesIO(raw))
    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
    chunks: list[np.ndarray] = []
    try:
        for packet in container.demux(audio=0):
            for frame in packet.decode():
                resampled = resampler.resample(frame)
                for resampled_frame in resampled:
                    chunks.append(resampled_frame.to_ndarray())
    finally:
        container.close()

    if not chunks:
        raise ValueError("no audio stream found")

    pcm = np.concatenate(chunks, axis=1).reshape(-1)
    if pcm.size < 512:
        raise ValueError("decoded audio too small")

    buffer = io.BytesIO()
    sf.write(buffer, pcm.astype(np.int16), 16000, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm up at startup so the first request is fast.
    get_model()
    yield


app = FastAPI(title="HabitPulse STT", lifespan=lifespan)


class TranscribeRequest(BaseModel):
    audio_base64: str = Field(min_length=8, max_length=32_000_000)
    audio_format: str = Field("wav", max_length=16)
    language: str | None = Field(None, max_length=40)


class TranscribeResponse(BaseModel):
    text: str
    language: str | None = None


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "model": Path(MODEL_PATH).name,
        "device": _device_used,
        "ready": _model is not None,
        "cuda_available": torch.cuda.is_available(),
    }


@app.post("/transcribe", response_model=TranscribeResponse)
def transcribe(req: TranscribeRequest) -> TranscribeResponse:
    audio_format = req.audio_format.lower().lstrip(".").split(";")[0]
    if audio_format not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=400, detail=f"unsupported audio format: {audio_format}")

    try:
        raw = base64.b64decode(req.audio_base64, validate=True)
    except Exception as exc:  # noqa: BLE001 - convert any decode error to 400
        raise HTTPException(status_code=400, detail="invalid base64 audio") from exc

    if len(raw) < 512:
        raise HTTPException(status_code=400, detail="audio too small")

    try:
        wav_bytes = decode_to_wav_16k(raw)
    except Exception as exc:  # noqa: BLE001 - decode failures are client errors
        raise HTTPException(status_code=400, detail=f"cannot decode audio: {exc}") from exc

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
        handle.write(wav_bytes)
        temp_path = handle.name

    try:
        model = get_model()
        with _infer_lock:
            results = model.transcribe(audio=temp_path, language=req.language)
        first = results[0]
        text = str(getattr(first, "text", "") or "").strip()
        language = getattr(first, "language", None)
        return TranscribeResponse(text=text, language=language)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - surface inference failures to the API layer
        log_error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"transcription failed: {exc}") from exc
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
