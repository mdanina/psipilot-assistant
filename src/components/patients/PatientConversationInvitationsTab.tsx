import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PatientConversationInvitationsTabProps {
  patientId: string;
}

export function PatientConversationInvitationsTab({
  patientId,
}: PatientConversationInvitationsTabProps) {
  const { toast } = useToast();

  const handleSend = () => {
    toast({
      title: "В разработке",
      description: "Функционал приглашений в диалоги находится в разработке",
    });
  };

  return (
    <div className="flex items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>AI Pre-Assessment</CardTitle>
          <CardDescription>
            Let the AI interview the patient about current issue, allergies,
            alcohol and tobacco consumption, and more.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleSend}
            className="w-full gap-2"
            disabled
          >
            <Send className="w-4 h-4" />
            Send
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
