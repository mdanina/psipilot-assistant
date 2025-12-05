import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Building2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function OnboardingPage() {
  const [clinicName, setClinicName] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (!user) {
        setError('User not authenticated');
        return;
      }

      // 1. Create the clinic
      const { data: clinic, error: clinicError } = await supabase
        .from('clinics')
        .insert({
          name: clinicName.trim(),
          address: clinicAddress.trim() || null,
          phone: clinicPhone.trim() || null,
          email: user.email,
        })
        .select()
        .single();

      if (clinicError) {
        console.error('Error creating clinic:', clinicError);
        setError(`Failed to create clinic: ${clinicError.message}`);
        return;
      }

      // 2. Update user profile with clinic_id and set as admin
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          clinic_id: clinic.id,
          role: 'admin', // First user becomes admin
        })
        .eq('id', user.id);

      if (profileError) {
        console.error('Error updating profile:', profileError);
        // Try to clean up the created clinic
        await supabase.from('clinics').delete().eq('id', clinic.id);
        setError(`Failed to update profile: ${profileError.message}`);
        return;
      }

      // 3. Refresh profile to get updated data
      await refreshProfile();

      // 4. Redirect to home
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Onboarding error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Welcome to PsiPilot!</CardTitle>
          <CardDescription>
            Let's set up your clinic to get started
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="clinicName">Clinic Name *</Label>
              <Input
                id="clinicName"
                type="text"
                placeholder="My Clinic"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                required
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinicAddress">Address</Label>
              <Textarea
                id="clinicAddress"
                placeholder="123 Main St, City, Country"
                value={clinicAddress}
                onChange={(e) => setClinicAddress(e.target.value)}
                disabled={isSubmitting}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinicPhone">Phone</Label>
              <Input
                id="clinicPhone"
                type="tel"
                placeholder="+7 (999) 123-45-67"
                value={clinicPhone}
                onChange={(e) => setClinicPhone(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                You will be the administrator
              </div>
              <p className="text-sm text-muted-foreground">
                As the clinic creator, you'll have full access to manage settings,
                invite team members, and configure the workspace.
              </p>
            </div>
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !clinicName.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating clinic...
                </>
              ) : (
                'Create Clinic & Continue'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
