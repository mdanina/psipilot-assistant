import { useState } from "react";
import { Users, Plus, RefreshCw, Search, Mail, Phone, FileText, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Patient {
  id: string;
  name: string;
  email: string;
  phone: string;
  lastActivity: string;
  documents: number;
}

const PatientsPage = () => {
  const [patients] = useState<Patient[]>([
    {
      id: "1",
      name: "Demo patient",
      email: "demo.patient@aisel.co",
      phone: "+4561311297",
      lastActivity: "yesterday at 7:38 PM",
      documents: 1,
    },
  ]);
  
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <>
      <Header title="Patients" icon={<Users className="w-5 h-5" />} />
      <div className="flex-1 p-6 overflow-auto">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Patients</h1>
            <p className="text-muted-foreground">Manage patients</p>
          </div>
          <div className="flex items-center gap-3">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Patient
            </Button>
            <Button variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh Activities
            </Button>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="e.g. john@doe.com"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 max-w-md"
          />
        </div>
        
        {/* Table */}
        <div className="bg-card rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Last Activity At</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell className="font-medium">{patient.name}</TableCell>
                  <TableCell>
                    <a href={`mailto:${patient.email}`} className="text-primary hover:underline flex items-center gap-1">
                      <Mail className="w-4 h-4" />
                      {patient.email}
                    </a>
                  </TableCell>
                  <TableCell>{patient.phone}</TableCell>
                  <TableCell className="text-muted-foreground">{patient.lastActivity}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <FileText className="w-4 h-4" />
                      {patient.documents}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {/* Table footer */}
          <div className="p-4 border-t border-border text-center text-sm text-muted-foreground">
            List of all patients and their details.
          </div>
        </div>
        
        {/* Pagination */}
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" className="gap-1">
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          <span className="px-3 py-1 bg-muted rounded text-sm">1</span>
          <Button variant="ghost" size="sm" className="gap-1">
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  );
};

export default PatientsPage;
