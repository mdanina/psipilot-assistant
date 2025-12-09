import { Construction } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PatientConversationInvitationsTabProps {
  patientId: string;
}

export function PatientConversationInvitationsTab({
  patientId,
}: PatientConversationInvitationsTabProps) {
  return (
    <div className="flex items-center justify-center py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Construction className="w-12 h-12 text-muted-foreground" />
          </div>
          <CardTitle>В разработке</CardTitle>
          <CardDescription className="mt-2">
            Раздел "Приглашения" находится в разработке и будет доступен в ближайшее время.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center">
            Здесь будет функционал для отправки приглашений пациентам в диалоги и предварительные опросы.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

