import { useState, useEffect } from "react";
import { Mic, FileText, X, Pause, Square, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecordingCardProps {
  onStartRecording: () => void;
  onGenerateNote: () => void;
}

export const RecordingCard = ({ onStartRecording, onGenerateNote }: RecordingCardProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")} : ${secs.toString().padStart(2, "0")}`;
  };

  const handleStartRecording = () => {
    setIsRecording(true);
    setRecordingTime(0);
    onStartRecording();
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    setIsPaused(false);
  };

  const handleCancelRecording = () => {
    setIsRecording(false);
    setRecordingTime(0);
    setIsPaused(false);
  };

  if (isRecording) {
    return (
      <div className="bg-card rounded-2xl shadow-elevated p-8 max-w-lg w-full relative">
        {/* Cancel button */}
        <button 
          onClick={handleCancelRecording}
          className="absolute top-4 right-4 text-destructive hover:text-destructive/80"
        >
          <X className="w-5 h-5" />
        </button>
        
        {/* Sparkle decoration */}
        <div className="absolute bottom-4 left-4 text-primary/30">
          <Sparkles className="w-5 h-5" />
        </div>
        
        <div className="text-center space-y-4">
          <h3 className="text-xl font-semibold text-primary">Recording in Progress</h3>
          <p className="text-success text-sm">Capturing your voice with precision</p>
          
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Remember <span className="text-primary underline cursor-pointer">patient consent</span>
            </p>
          </div>
          
          {/* Recording controls */}
          <div className="flex items-center justify-center gap-4 pt-4">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-recording animate-pulse-recording" />
              <Mic className="w-4 h-4 text-recording" />
              <span className="text-sm font-mono text-foreground">{formatTime(recordingTime)}</span>
            </div>
            
            {/* Waveform visualization */}
            <div className="flex items-center gap-0.5 h-6">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="w-0.5 bg-primary/60 rounded-full waveform-bar"
                  style={{ 
                    animationDelay: `${i * 0.1}s`,
                    height: `${Math.random() * 16 + 4}px`
                  }}
                />
              ))}
            </div>
            
            {/* Pause button */}
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="p-2 hover:bg-muted rounded-lg"
            >
              <Pause className="w-5 h-5 text-foreground" />
            </button>
            
            {/* Stop button */}
            <button
              onClick={handleStopRecording}
              className="p-2 bg-recording rounded-lg hover:bg-recording/90"
            >
              <Square className="w-5 h-5 text-white fill-white" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl shadow-elevated p-8 max-w-lg w-full relative">
      {/* Sparkle decoration */}
      <div className="absolute top-4 right-4 text-primary/30">
        <Sparkles className="w-5 h-5" />
      </div>
      <div className="absolute bottom-4 left-4 text-primary/30">
        <Sparkles className="w-5 h-5" />
      </div>
      
      <div className="text-center space-y-6">
        {/* Microphone icon */}
        <div className="mx-auto w-16 h-16 bg-primary rounded-xl flex items-center justify-center shadow-lg">
          <Mic className="w-8 h-8 text-primary-foreground" />
        </div>
        
        <div>
          <h3 className="text-xl font-semibold text-foreground mb-2">Create with AI</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Begin recording your patient encounter or create clinical notes. Our AI will help structure your documentation intelligently.
          </p>
        </div>
        
        {/* Action buttons */}
        <div className="flex gap-3 justify-center">
          <Button
            onClick={handleStartRecording}
            className="gap-2"
          >
            <Mic className="w-4 h-4" />
            Start recording
          </Button>
          <Button
            variant="outline"
            onClick={onGenerateNote}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            Generate AI Note
          </Button>
        </div>
      </div>
    </div>
  );
};
