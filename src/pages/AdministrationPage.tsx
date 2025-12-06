import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Settings, 
  Users, 
  UserPlus, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  X,
  Edit,
  Trash2,
  Shield,
  User as UserIcon,
  UserCog
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ClinicUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'doctor' | 'assistant';
  created_at: string;
};

type Invitation = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'doctor' | 'assistant';
  status: string;
  expires_at: string;
  created_at: string;
};

export default function AdministrationPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<ClinicUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Invite user dialog
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'doctor' | 'assistant'>('doctor');
  const [inviteFullName, setInviteFullName] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  // Edit user dialog
  const [editingUser, setEditingUser] = useState<ClinicUser | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'doctor' | 'assistant'>('doctor');
  const [isSaving, setIsSaving] = useState(false);

  // Load clinic users and invitations
  useEffect(() => {
    if (profile?.clinic_id && profile?.role === 'admin') {
      loadUsers();
      loadInvitations();
    }
  }, [profile?.clinic_id, profile?.role]);

  const loadUsers = async () => {
    if (!profile?.clinic_id) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at')
        .eq('clinic_id', profile.clinic_id)
        .order('created_at', { ascending: false });

      if (fetchError) {
        setError(`Failed to load users: ${fetchError.message}`);
        return;
      }

      setUsers(data || []);
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadInvitations = async () => {
    if (!profile?.clinic_id) return;

    try {
      const { data, error: fetchError } = await supabase
        .from('user_invitations')
        .select('*')
        .eq('clinic_id', profile.clinic_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (!fetchError) {
        setInvitations(data || []);
      }
    } catch (err) {
      console.error('Error loading invitations:', err);
    }
  };

  const handleInviteUser = async () => {
    if (!profile?.clinic_id || !inviteEmail.trim()) return;

    setIsInviting(true);
    setError(null);
    setSuccess(null);

    try {
      // Check if user already exists in clinic
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', inviteEmail.trim().toLowerCase())
        .eq('clinic_id', profile.clinic_id)
        .single();

      if (existingUser) {
        setError(`User ${inviteEmail} is already in your clinic`);
        return;
      }

      // Create invitation using the function
      const { data: invitationData, error: inviteError } = await supabase.rpc(
        'create_user_invitation',
        {
          p_email: inviteEmail.trim(),
          p_full_name: inviteFullName.trim() || null,
          p_role: inviteRole,
        }
      );

      if (inviteError) {
        setError(`Failed to create invitation: ${inviteError.message}`);
        return;
      }

      setSuccess(
        `Invitation sent to ${inviteEmail}. They will be added to your clinic when they register.`
      );

      setIsInviteDialogOpen(false);
      setInviteEmail('');
      setInviteFullName('');
      setInviteRole('doctor');
      await loadUsers();
      await loadInvitations();
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsInviting(false);
    }
  };

  const handleEditUser = (user: ClinicUser) => {
    setEditingUser(user);
    setEditEmail(user.email);
    setEditFullName(user.full_name || '');
    setEditRole(user.role);
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          email: editEmail.trim(),
          full_name: editFullName.trim() || null,
          role: editRole,
        })
        .eq('id', editingUser.id);

      if (updateError) {
        setError(`Failed to update user: ${updateError.message}`);
        return;
      }

      setSuccess('User updated successfully');
      setEditingUser(null);
      await loadUsers();
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to remove ${userEmail} from your clinic?`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ clinic_id: null })
        .eq('id', userId);

      if (updateError) {
        setError(`Failed to remove user: ${updateError.message}`);
        return;
      }

      setSuccess('User removed from clinic successfully');
      await loadUsers();
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-4 h-4 text-primary" />;
      case 'doctor':
        return <UserIcon className="w-4 h-4 text-blue-500" />;
      case 'assistant':
        return <UserCog className="w-4 h-4 text-green-500" />;
      default:
        return <UserIcon className="w-4 h-4" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-primary/10 text-primary border-primary/20';
      case 'doctor':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'assistant':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Only show for admins
  if (profile?.role !== 'admin') {
    return (
      <>
        <Header title="Administration" icon={<Settings className="w-5 h-5" />} />
        <div className="flex-1 p-6 overflow-auto">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You need administrator privileges to access this page.
            </AlertDescription>
          </Alert>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Administration" icon={<Settings className="w-5 h-5" />} />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {/* Header with Add User button */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Clinic Users</h1>
              <p className="text-muted-foreground mt-1">
                Manage users and their roles in your clinic
              </p>
            </div>
            <Button onClick={() => setIsInviteDialogOpen(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </div>

          {/* Users List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Users ({users.length})
              </CardTitle>
              <CardDescription>
                All users associated with your clinic
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">No users found</p>
                  <Button onClick={() => setIsInviteDialogOpen(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add First User
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                          {user.full_name
                            ? user.full_name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)
                            : user.email[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {user.full_name || user.email}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {user.email}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-1 rounded-md text-xs font-medium border flex items-center gap-1 ${getRoleBadgeColor(
                              user.role
                            )}`}
                          >
                            {getRoleIcon(user.role)}
                            <span className="capitalize">{user.role}</span>
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {user.id !== profile?.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveUser(user.id, user.email)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Invitations Card */}
          {invitations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  Pending Invitations ({invitations.length})
                </CardTitle>
                <CardDescription>
                  Users who have been invited but haven't registered yet
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                          {invitation.full_name
                            ? invitation.full_name
                                .split(' ')
                                .map((n: string) => n[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)
                            : invitation.email[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {invitation.full_name || invitation.email}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {invitation.email}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Expires: {new Date(invitation.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded-md text-xs font-medium border capitalize ${getRoleBadgeColor(
                            invitation.role
                          )}`}
                        >
                          {invitation.role}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (confirm(`Cancel invitation for ${invitation.email}?`)) {
                            const { error } = await supabase
                              .from('user_invitations')
                              .update({ status: 'cancelled' })
                              .eq('id', invitation.id);
                            
                            if (!error) {
                              await loadInvitations();
                            }
                          }
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Invite User Dialog */}
      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User to Clinic</DialogTitle>
            <DialogDescription>
              Invite a user to your clinic by email. They will be automatically added when they register.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email *</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-name">Full Name</Label>
              <Input
                id="invite-name"
                value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role *</Label>
              <Select value={inviteRole} onValueChange={(value: 'doctor' | 'assistant') => setInviteRole(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="doctor">Doctor</SelectItem>
                  <SelectItem value="assistant">Assistant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsInviteDialogOpen(false);
                setInviteEmail('');
                setInviteFullName('');
                setInviteRole('doctor');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleInviteUser} disabled={isInviting || !inviteEmail.trim()}>
              {isInviting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information and role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email *</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role *</Label>
              <Select
                value={editRole}
                onValueChange={(value: 'admin' | 'doctor' | 'assistant') => setEditRole(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="doctor">Doctor</SelectItem>
                  <SelectItem value="assistant">Assistant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingUser(null)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveUser} disabled={isSaving || !editEmail.trim()}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
