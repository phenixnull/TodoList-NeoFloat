# HabitPulse STT service (PC-side)

本机（RTX 3090 Ti）部署 Qwen3-ASR-0.6B，为手机端提供语音转文字服务。
手机端只负责录音并上传，推理全部在这台电脑上完成。

## 一次性安装

```powershell
cd stt-service
uv venv --python 3.12 .venv
uv pip install -p .venv\Scripts\python.exe torch --index-url https://download.pytorch.org/whl/cu124
uv pip install -p .venv\Scripts\python.exe -r requirements.txt

# 下载模型（国内推荐 ModelScope）
uv pip install -p .venv\Scripts\python.exe modelscope
.venv\Scripts\modelscope.exe download --model Qwen/Qwen3-ASR-0.6B --local_dir D:\models\Qwen3-ASR-0.6B
```

模型默认读取 `QWEN_ASR_MODEL_PATH`，未设置时使用 `D:\models\Qwen3-ASR-0.6B`。

## 启动

```powershell
powershell -ExecutionPolicy Bypass -File start-stt-service.ps1
```

脚本会以隐藏窗口拉起 uvicorn（日志写入 `stt-out.log` / `stt-err.log`），
适合开机自启，不会留下终端窗口。

计划任务推荐用 VBS 包裹，彻底无窗口：

```powershell
wscript.exe //B //Nologo <本目录>\run-hidden.vbs
```

服务监听 `http://127.0.0.1:8100`，仅本机可访问；
手机端通过 HabitPulse 服务端（Fastify）代理访问，不直接暴露。
