import { useState } from "react";
import { Calendar, Plus, Mic, ChevronDown, FileText, Sparkles, Circle } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Session {
  id: string;
  name: string;
  isNew?: boolean;
  isActive?: boolean;
}

interface Section {
  id: string;
  name: string;
  content?: string;
}

const SessionsPage = () => {
  const [sessions, setSessions] = useState<Session[]>([
    { id: "new", name: "New Session", isNew: true },
    { id: "1", name: "Session created on...", isActive: true },
  ]);
  
  const [activeSession, setActiveSession] = useState("1");
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const [sections] = useState<Section[]>([
    { id: "contact", name: "Contact reason" },
    { id: "history", name: "History of Pre..." },
    { id: "past", name: "Past Psychiatri..." },
    { id: "somatic", name: "Somatic History" },
    { id: "substance", name: "Substance use" },
    { id: "family", name: "Family History" },
    { id: "social", name: "Social History" },
    { id: "current", name: "Current psych..." },
    { id: "mental", name: "Mental status ..." },
    { id: "risk", name: "Risk assessme..." },
  ]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")} : ${secs.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <Header title="Sessions" icon={<Calendar className="w-5 h-5" />} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Session tabs */}
        <div className="border-b border-border px-6 py-3 flex items-center gap-2">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => setActiveSession(session.id)}
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                activeSession === session.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <Circle className={`w-2 h-2 ${session.isNew ? "text-destructive" : "text-destructive"} fill-current`} />
              {session.name}
            </button>
          ))}
          <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel - Patient information input */}
          <div className="flex-1 border-r border-border flex flex-col">
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Patient information input</h2>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <FileText className="w-3 h-3" />
                  Transcript
                  <button className="ml-1 hover:text-destructive">×</button>
                </Badge>
              </div>
            </div>
            
            <div className="flex-1 p-6 overflow-auto">
              {transcript ? (
                <div className="prose prose-sm max-w-none">
                  {transcript}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  When you start speaking, your transcription will appear here.
                </p>
              )}
            </div>
            
            {/* Recording controls */}
            <div className="p-4 border-t border-border flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isRecording ? "bg-recording animate-pulse-recording" : "bg-success"}`} />
                <span className="text-sm text-muted-foreground">Ready</span>
              </div>
              
              <div className="flex items-center gap-1">
                <Button size="sm" variant="default" className="gap-1">
                  <Mic className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" className="gap-1">
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="default" className="gap-1 bg-primary">
                  DK
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
              
              <Button size="sm" variant="ghost">
                <FileText className="w-4 h-4" />
              </Button>
              
              <div className="flex-1" />
              
              <Button className="gap-2">
                <Sparkles className="w-4 h-4" />
                Generate Summary
              </Button>
            </div>
          </div>
          
          {/* Right panel - Clinical notes output */}
          <div className="w-[400px] flex flex-col">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Clinical notes output</h2>
              <Button variant="outline" size="sm" className="gap-1">
                → Ok, Next Session
              </Button>
            </div>
            
            <div className="flex-1 p-6 overflow-auto">
              {/* Note tabs */}
              <div className="flex items-center gap-2 mb-6">
                <Badge variant="outline" className="gap-1">
                  Initial Psychiatric Assessm...
                  <button className="ml-1 text-destructive">🗑</button>
                </Badge>
                <button className="p-1 text-muted-foreground hover:text-foreground">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              {/* Sections */}
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-foreground mb-3">Sections</h3>
                {sections.map((section) => (
                  <button
                    key={section.id}
                    className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg flex items-center justify-between group"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">☰</span>
                      {section.name}
                    </span>
                    <ChevronDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
                <button className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted rounded-lg">
                  New section
                </button>
              </div>
              
              {/* No notes placeholder */}
              <div className="mt-12 text-center">
                <h4 className="font-semibold text-foreground mb-2">No Notes Yet</h4>
                <p className="text-sm text-muted-foreground">
                  You don't have any notes for this session. Type your description and click <span className="font-medium">Generate</span> to create your first note.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SessionsPage;
