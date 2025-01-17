// server/voice/VoiceService.ts

interface SynthesisRequest {
  text: string;
  user_id: number;
  voice_id?: string;
}

interface SynthesisResponse {
  success: boolean;
  audioData: string; // base64 encoded audio
}

interface CloneVoiceResponse {
  success: boolean;
  voiceId: string;
}

export class VoiceService {
  private voiceServiceUrl: string;

  constructor() {
    this.voiceServiceUrl = process.env.VOICE_SERVICE_URL || 'http://localhost:8000';
  }

  /**
   * Synthesize text to speech using ElevenLabs
   */
  async synthesizeText(text: string, userId: number, voiceId?: string): Promise<string> {
    const response = await fetch(`${this.voiceServiceUrl}/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        user_id: userId,
        voice_id: voiceId,
      } as SynthesisRequest),
    });

    if (!response.ok) {
      throw new Error(`Voice synthesis failed: ${response.statusText}`);
    }

    const data = await response.json() as SynthesisResponse;
    return data.audioData; // Returns base64 encoded audio
  }

  /**
   * Clone a user's voice using provided audio samples
   */
  async cloneVoice(userId: number, name: string, audioFiles: Buffer[]): Promise<string> {
    const formData = new FormData();
    formData.append('user_id', userId.toString());
    formData.append('name', name);
    
    audioFiles.forEach((file, index) => {
      formData.append(`audio_file_${index}`, new Blob([file]));
    });

    const response = await fetch(`${this.voiceServiceUrl}/clone-voice`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Voice cloning failed: ${response.statusText}`);
    }

    const data = await response.json() as CloneVoiceResponse;
    return data.voiceId;
  }
} 