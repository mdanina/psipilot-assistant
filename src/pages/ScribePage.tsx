import { FileText } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { RecordingCard } from "@/components/scribe/RecordingCard";

const ScribePage = () => {
  const handleStartRecording = () => {
    console.log("Recording started");
  };

  const handleGenerateNote = () => {
    console.log("Generating AI note");
  };

  return (
    <>
      <Header title="Scribe" icon={<FileText className="w-5 h-5" />} />
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
        {/* Hero section */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-primary mb-3">
            AI-Powered Clinical Documentation
          </h1>
          <p className="text-muted-foreground max-w-xl">
            Transform your medical notes with intelligent transcription and automated structuring
          </p>
        </div>
        
        {/* Recording card */}
        <RecordingCard
          onStartRecording={handleStartRecording}
          onGenerateNote={handleGenerateNote}
        />
      </div>
    </>
  );
};

export default ScribePage;
