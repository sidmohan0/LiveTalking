# Virtual Camera Complete Guide

## Quick Start

### 1. Start the Server

```bash
python app.py --transport virtualcam --model wav2lip --avatar_id wav2lip256_avatar1
```

**OBS Studio**: Add a Video Capture Device → OBS Virtual Camera

You need to download and launch OBS Studio.

### 2. Open the Control Page

Visit in your browser: **http://localhost:8010/virtualcam.html**

### 3. Control the Digital Human

- Enter text and click "Send Text" to make the digital human speak
- Click "Interrupt Playback" to stop the current speech
- Or use keyboard shortcuts: `Ctrl+Enter` to send, `Escape` to interrupt

### 4. Use in Other Applications

- **Zoom/Teams**: Select the camera "OBS Virtual Camera"
- In Tencent Meeting, use the newly created virtual camera as shown below:

![1782554830929](image/virtualcam_guide/1782554830929.png)

---

## Feature Overview

### Key Features

✅ Background rendering - does not depend on a browser page  
✅ Automatic audio device - auto-detects the system default speaker  
✅ Color correction - automatically converts BGR to RGB  
✅ Web console - full HTTP API and page-based control  
✅ Real-time monitoring - live display of speaking status and device info  

### Run Modes

| Mode           | Command                    | Description                                  |
| -------------- | -------------------------- | -------------------------------------------- |
| Virtual Camera | `--transport virtualcam` | Runs in the background, streams to OBS Virtual Camera |
| WebRTC         | `--transport webrtc`     | Traditional mode, accessed via browser       |

---


## Usage Guide

### OBS Studio Installation and Setup

#### The Relationship Between OBS and pyvirtualcam

- **OBS Studio**: Provides the virtual camera device driver
- **pyvirtualcam**: Python library that pushes the video stream to the virtual camera
- **Zoom/Teams/Tencent Meeting**: Read frames from the virtual camera

**Workflow**: OBS creates the device → pyvirtualcam streams to it → other applications read from it

#### Installation Steps

1. **Download and install OBS Studio**

   - Official site: https://obsproject.com/
2. **You must launch OBS Studio once before first use**

   - Open OBS Studio (first time)
   - This activates the virtual camera device
   - Close OBS (the device is now registered with the system)
3. **Verify the virtual camera is registered**

   ```python
   import pyvirtualcam

   try:
       cam = pyvirtualcam.Camera(width=640, height=480, fps=30)
       print(f"Success: {cam.device}")  # Should print: OBS Virtual Camera
       cam.close()
   except Exception as e:
       print(f"Failed: {e}")
   ```

**Important notes**:

- ✅ OBS must be launched once before first use
- ✅ After that, OBS does not need to be open; the device is available automatically
- ✅ The device persists across system reboots

### Prerequisites

```bash
# After installing OBS Studio, install the Python dependencies
pip install pyvirtualcam pyaudio
```

### Basic Usage

#### Automatic Audio Device (Recommended)

```bash
python app.py --transport virtualcam --model wav2lip --avatar_id wav2lip256_avatar1
```

#### Manually Specify an Audio Device

```bash
# 1. List the audio devices
python list_audio_devices.py

# 2. Use a specific device index
python app.py --transport virtualcam --audio_output_device 25
```

#### Using a YAML Configuration

```yaml
# config.yaml
transport: virtualcam
model: wav2lip
avatar_id: wav2lip256_avatar1
audio_output_device: 25  # optional
```

```bash
python app.py  # config.yaml is loaded automatically
```

---

## Control Page Features

Visit: **http://localhost:8010/virtualcam.html**

### Feature Modules

| Module               | Function                                                        |
| -------------------- | --------------------------------------------------------------- |
| **Status Display**   | Live speaking status, virtual camera info, audio device info    |
| **Voice Output**     | Text input, send text, interrupt playback, quick phrases        |
| **Runtime Config**   | Read-only display of current runtime parameters (avatar, TTS, voice, etc.) |
| **History**          | Keeps the last 20 sent entries; click to replay                 |

### Keyboard Shortcuts

| Shortcut         | Function            |
| ---------------- | ------------------- |
| `Ctrl + Enter` | Send text           |
| `Escape`       | Interrupt playback  |

### HTTP API

```bash
# Send text
curl -X POST http://localhost:8010/human \
  -H "Content-Type: application/json" \
  -d '{"sessionid":"0","type":"echo","text":"Hello"}'

# Interrupt speech
curl -X POST http://localhost:8010/interrupt_talk \
  -H "Content-Type: application/json" \
  -d '{"sessionid":"0"}'

# Query status
curl -X POST http://localhost:8010/is_speaking \
  -H "Content-Type: application/json" \
  -d '{"sessionid":"0"}'

# Get full configuration
curl http://localhost:8010/api/virtualcam/status
```

---

## Audio Device Configuration

### List Devices

```bash
python list_audio_devices.py
```

Example output:

```
[Output Devices]:

Device Index: 5
  Name: Speakers (2- Realtek(R) Audio)
  Output Channels: 2

Device Index: 25
  Name: Speakers (2- Realtek(R) Audio)
  Host API: Windows WASAPI
```

### Device Selection Tips

1. **Prefer WASAPI devices** (indexes are typically 22-27) - low latency
2. **DirectSound devices** (indexes are typically 15-21) - good compatibility
3. **Leave blank to use the system default** - automatic selection, hassle-free

---

## FAQ

### Q1: No sound

**Troubleshooting steps**:

1. Check the startup log:

   ```
   [VirtualCam Audio] Using default output device: Speakers (index 25)
   ```
2. Verify that the device index refers to an output device:

   ```bash
   python list_audio_devices.py
   ```
3. Manually specify the audio device:

   ```bash
   python app.py --transport virtualcam --audio_output_device 25
   ```
4. Confirm the TTS is working (the log contains `doubao tts Time to first chunk`)

### Q2: The picture has a blue tint

**Fixed**: the code automatically converts BGR → RGB

### Q3: RuntimeError: virtual camera output could not be started

**Cause**: the virtual camera device is not registered or activated

**Resolution steps**:

1. Confirm OBS Studio is installed: https://obsproject.com/
2. **You must launch OBS Studio once before first use**
   - Open OBS Studio
   - Close OBS (the device is now activated)
3. Verify the device is registered:
   ```python
   import pyvirtualcam
   cam = pyvirtualcam.Camera(width=640, height=480, fps=30)
   print(cam.device)  # Should print: OBS Virtual Camera
   ```
4. After that, OBS does not need to be open; the device is available automatically

### Q4: ModuleNotFoundError: No module named 'pyaudio'

```bash
pip install pyaudio
# or
pip install pipwin && pipwin install pyaudio
```

### Q5: ModuleNotFoundError: No module named 'pyvirtualcam'

```bash
pip install pyvirtualcam
```

### Q6: How do I confirm the virtual camera is working?

1. Check the startup log:

   ```
   VirtualCam output started: OBS Virtual Camera with resolution 1280x720
   ```
2. Verify in OBS:

   - Add a "Video Capture Device"
   - Select "OBS Virtual Camera"
   - You should see the digital human video
3. Send a test request:

   ```bash
   curl -X POST http://localhost:8010/human -H "Content-Type: application/json" -d '{"sessionid":"0","type":"echo","text":"Test"}'
   ```

### Q7: Severe audio latency

**Optimizations**:

1. Use a WASAPI device (low latency)
2. Close other audio applications
3. Check CPU usage

---

## Technical Architecture

### Rendering Pipeline

```
app.py
  └─> Create Session 0
      └─> render() thread
          └─> inference() generates frames
              └─> process_frames() pushes frames
                  └─> virtualcam.py
                      ├─> Video: BGR→RGB → pyvirtualcam
                      └─> Audio: PyAudio → speakers
```

### API Endpoints

| Endpoint                   | Method | Function               |
| -------------------------- | ------ | ---------------------- |
| `/human`                 | POST   | Send text              |
| `/interrupt_talk`        | POST   | Interrupt speech       |
| `/is_speaking`           | POST   | Query speaking status  |

### Key Files

| File                        | Role                          |
| --------------------------- | ----------------------------- |
| `config.py`               | Command-line argument definitions |
| `app.py`                  | Startup logic                 |
| `base_avatar.py`          | Rendering thread              |
| `streamout/virtualcam.py` | Virtual camera output         |
| `web/virtualcam.html`     | Web control page              |
| `list_audio_devices.py`   | Audio device listing tool     |

---

## Summary

The virtual camera feature is now fully implemented, supporting:

✅ **Core features** - automatic audio detection, color correction, background rendering  
✅ **Ease of use** - web console, HTTP API, interactive controls  
✅ **Stability** - dedicated thread, exception handling, resource management  

You can now easily stream your digital human into Zoom, Teams, OBS, and other applications!
