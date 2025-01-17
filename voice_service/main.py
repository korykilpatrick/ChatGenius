from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import os
from elevenlabs import generate, clone, set_api_key
from dotenv import load_dotenv
import io
import base64

load_dotenv()

# Initialize ElevenLabs with API key
set_api_key(os.getenv("ELEVENLABS_API_KEY"))

app = FastAPI()

class SynthesisRequest(BaseModel):
    text: str
    user_id: int
    voice_id: str = None  # Optional - if not provided, will use default voice

@app.post("/synthesize")
async def synthesize_speech(request: SynthesisRequest):
    try:
        # Generate audio using ElevenLabs
        audio = generate(
            text=request.text,
            voice=request.voice_id if request.voice_id else "Josh",  # Default voice
            model="eleven_monolingual_v1"
        )
        
        # Convert audio bytes to base64
        audio_base64 = base64.b64encode(audio).decode('utf-8')
        
        return JSONResponse({
            "success": True,
            "audio_data": audio_base64
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/clone-voice")
async def clone_voice(user_id: int, name: str, audio_files: list[bytes]):
    """Clone a user's voice using provided audio samples"""
    try:
        voice = clone(
            name=f"user_{user_id}_{name}",
            files=audio_files
        )
        
        return JSONResponse({
            "success": True,
            "voice_id": voice.voice_id
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 