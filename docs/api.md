# LiveTalking API Reference

Base URL: `http://<host>:<listenport>`

All endpoints share a unified response format:

```json
{ "code": 0, "msg": "ok", "data": {} }
```

A `code` of 0 indicates success; any non-zero value indicates an error.

---

## 1. WebRTC Offer

Exchange SDP to establish a WebRTC connection.

```
POST /offer
```

**Content-Type**: `application/json`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| `sdp` | Yes | string | — | WebRTC Offer SDP |
| `type` | Yes | string | — | Must be `offer` |
| `avatar` | No | string | Startup argument value | Specifies the digital human ID |
| `refaudio` | No | string | — | Reference audio |
| `reftext` | No | string | — | Reference text |
| `custom_config` | No | string | — | Action choreography configuration as a JSON string |

**Response**:

```json
{
  "sdp": "v=0\r\n...",
  "type": "answer",
  "sessionid": "session-uuid"
}
```

---

## 2. Text Driver (Human)

Send text to make the digital human speak, either echoing it directly or via LLM conversation.

```
POST /human
```

**Content-Type**: `application/json`

| Parameter | Required | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| `sessionid` | Yes | string | — | Session ID |
| `text` | Yes | string | — | Input text |
| `type` | Yes | string | — | `echo`: repeat the text directly; `chat`: trigger an LLM answer |
| `interrupt` | No | bool | false | Whether to interrupt the current playback |
| `tts` | No | object | — | Configuration passed through to the TTS engine (e.g., `voice`, `emotion`) |

**Response**:

```json
{ "code": 0, "msg": "ok" }
```

---

## 3. Audio Driver (Human Audio)

Upload an audio file to drive the digital human.

```
POST /humanaudio
```

**Content-Type**: `multipart/form-data`

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `sessionid` | Yes | string | Session ID |
| `file` | Yes | file | Audio file |

**Response**:

```json
{ "code": 0, "msg": "ok" }
```

---

## 4. Interrupt Playback

Immediately clears the audio queue of the current session.

```
POST /interrupt_talk
```

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `sessionid` | Yes | string | Session ID |

**Response**:

```json
{ "code": 0, "msg": "ok" }
```

---

## 5. Query Speaking Status

```
POST /is_speaking
```

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `sessionid` | Yes | string | Session ID |

**Response**:

```json
{
  "code": 0,
  "msg": "ok",
  "data": true
}
```

---

## 6. Recording Control

Controls server-side rendering recording.

```
POST /record
```

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `sessionid` | Yes | string | Session ID |
| `type` | Yes | string | `start_record`: start recording; `end_record`: stop and merge |

**Response**:

```json
{ "code": 0, "msg": "ok" }
```

---

## 7. Download Recording

Download the finished MP4 recording.

```
GET /record/{sessionid}
```

**Path parameter**: `sessionid` — Session ID

**Response**: MP4 file stream. Returns 404 if the file does not exist.

---

## 8. Set Action Choreography (Audiotype)

```
POST /set_audiotype
```

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `sessionid` | Yes | string | Session ID |
| `audiotype` | Yes | int | Predefined action/state index |

**Response**:

```json
{ "code": 0, "msg": "ok" }
```
