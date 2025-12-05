import { Building2 } from "lucide-react";
import { Header } from "@/components/layout/Header";

const ClinicPage = () => {
  return (
    <>
      <Header title="Clinic" icon={<Building2 className="w-5 h-5" />} />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Building2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Clinic Settings</h2>
          <p className="text-muted-foreground">Configure your clinic settings and preferences</p>
        </div>
      </div>
    </>
  );
};

export default ClinicPage;
