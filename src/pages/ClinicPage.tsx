import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Loader2, CheckCircle2, AlertCircle, Edit } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const ClinicPage = () => {
  const { profile, refreshProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [clinicName, setClinicName] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicEmail, setClinicEmail] = useState('');

  // Update form state when clinic loads
  useEffect(() => {
    if (profile?.clinic) {
      setClinicName(profile.clinic.name || '');
      setClinicAddress(profile.clinic.address || '');
      setClinicPhone(profile.clinic.phone || '');
      setClinicEmail(profile.clinic.email || '');
    }
  }, [profile?.clinic]);

  const handleSave = async () => {
    if (!profile?.clinic_id) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: updateError } = await supabase
        .from('clinics')
        .update({
          name: clinicName.trim(),
          address: clinicAddress.trim() || null,
          phone: clinicPhone.trim() || null,
          email: clinicEmail.trim() || null,
        })
        .eq('id', profile.clinic_id);

      if (updateError) {
        setError(`Failed to update clinic: ${updateError.message}`);
        return;
      }

      setSuccess('Clinic updated successfully');
      setIsEditing(false);
      await refreshProfile();
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (profile?.clinic) {
      setClinicName(profile.clinic.name || '');
      setClinicAddress(profile.clinic.address || '');
      setClinicPhone(profile.clinic.phone || '');
      setClinicEmail(profile.clinic.email || '');
    }
  };

  return (
    <>
      <Header title="Clinic" icon={<Building2 className="w-5 h-5" />} />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-3xl mx-auto">
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-6">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                  <CardTitle>Clinic Information</CardTitle>
                </div>
                {profile?.clinic && !isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                )}
              </div>
              <CardDescription>
                Manage your clinic details and settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!profile?.clinic_id ? (
                <div className="text-center py-12">
                  <Building2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-foreground mb-2">No Clinic Assigned</h2>
                  <p className="text-muted-foreground mb-6">
                    You don't have a clinic assigned to your account. Please contact an administrator.
                  </p>
                  <Button asChild>
                    <a href="/onboarding">Complete Onboarding</a>
                  </Button>
                </div>
              ) : !profile?.clinic ? (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 text-muted-foreground mx-auto mb-4 animate-spin" />
                  <p className="text-muted-foreground">Loading clinic information...</p>
                </div>
              ) : isEditing ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="clinicName">Clinic Name *</Label>
                    <Input
                      id="clinicName"
                      value={clinicName}
                      onChange={(e) => setClinicName(e.target.value)}
                      placeholder="Enter clinic name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clinicAddress">Address</Label>
                    <Input
                      id="clinicAddress"
                      value={clinicAddress}
                      onChange={(e) => setClinicAddress(e.target.value)}
                      placeholder="Enter clinic address"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clinicPhone">Phone</Label>
                    <Input
                      id="clinicPhone"
                      value={clinicPhone}
                      onChange={(e) => setClinicPhone(e.target.value)}
                      placeholder="Enter clinic phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clinicEmail">Email</Label>
                    <Input
                      id="clinicEmail"
                      type="email"
                      value={clinicEmail}
                      onChange={(e) => setClinicEmail(e.target.value)}
                      placeholder="Enter clinic email"
                    />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleSave}
                      disabled={isSaving || !clinicName.trim()}
                    >
                      {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCancel}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label className="text-muted-foreground">Clinic Name</Label>
                    <p className="text-sm font-medium mt-1">{profile.clinic.name || 'Not set'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Address</Label>
                    <p className="text-sm font-medium mt-1">{profile.clinic.address || 'Not set'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Phone</Label>
                    <p className="text-sm font-medium mt-1">{profile.clinic.phone || 'Not set'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Email</Label>
                    <p className="text-sm font-medium mt-1">{profile.clinic.email || 'Not set'}</p>
                  </div>
                  <div className="pt-4 border-t">
                    <Label className="text-muted-foreground">Clinic ID</Label>
                    <p className="text-sm font-mono text-muted-foreground mt-1">{profile.clinic_id}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default ClinicPage;
