import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
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
  UserCog,
  Building2
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
import { getSpecializationList, getSpecializationName } from '@/lib/specializations';

type ClinicUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'specialist' | 'assistant';
  specialization: string | null;
  created_at: string;
};

type Invitation = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'specialist' | 'assistant';
  status: string;
  expires_at: string;
  created_at: string;
};

export default function AdministrationPage() {
  const { profile, refreshProfile } = useAuth();
  const [users, setUsers] = useState<ClinicUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Clinic info editing
  const [isEditingClinic, setIsEditingClinic] = useState(false);
  const [isSavingClinic, setIsSavingClinic] = useState(false);
  const [clinicName, setClinicName] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicEmail, setClinicEmail] = useState('');
  
  // Invite user dialog
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'specialist' | 'assistant'>('specialist');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteSpecialization, setInviteSpecialization] = useState<string>('none');
  const [isInviting, setIsInviting] = useState(false);

  // Edit user dialog
  const [editingUser, setEditingUser] = useState<ClinicUser | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'specialist' | 'assistant'>('specialist');
  const [editSpecialization, setEditSpecialization] = useState<string>('none');
  const [isSaving, setIsSaving] = useState(false);

  // Update clinic form state when clinic loads
  useEffect(() => {
    if (profile?.clinic) {
      setClinicName(profile.clinic.name || '');
      setClinicAddress(profile.clinic.address || '');
      setClinicPhone(profile.clinic.phone || '');
      setClinicEmail(profile.clinic.email || '');
    }
  }, [profile?.clinic]);

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
        .select('id, email, full_name, role, specialization, created_at')
        .eq('clinic_id', profile.clinic_id)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error loading users:', fetchError);
        setError(`Не удалось загрузить пользователей: ${fetchError.message}`);
        setUsers([]);
        return;
      }

      setUsers(data || []);
    } catch (err) {
      console.error('Exception loading users:', err);
      setError(`Ошибка: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
      setUsers([]);
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
        setError(`Пользователь ${inviteEmail} уже находится в вашей клинике`);
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
        setError(`Не удалось создать приглашение: ${inviteError.message}`);
        return;
      }

      setSuccess(
        `Приглашение отправлено на ${inviteEmail}. Они будут добавлены в вашу клинику при регистрации.`
      );

      setIsInviteDialogOpen(false);
      setInviteEmail('');
      setInviteFullName('');
      setInviteRole('specialist');
      setInviteSpecialization('');
      await loadUsers();
      await loadInvitations();
    } catch (err) {
      setError(`Ошибка: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    } finally {
      setIsInviting(false);
    }
  };

  const handleEditUser = (user: ClinicUser) => {
    setEditingUser(user);
    setEditEmail(user.email);
    setEditFullName(user.full_name || '');
    setEditRole(user.role);
    setEditSpecialization(user.specialization || 'none');
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
          specialization: editSpecialization && editSpecialization !== 'none' ? editSpecialization : null,
        })
        .eq('id', editingUser.id);

      if (updateError) {
        setError(`Не удалось обновить пользователя: ${updateError.message}`);
        return;
      }

      setSuccess('Пользователь успешно обновлен');
      setEditingUser(null);
      await loadUsers();
    } catch (err) {
      setError(`Ошибка: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Вы уверены, что хотите удалить ${userEmail} из вашей клиники?`)) {
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
        setError(`Не удалось удалить пользователя: ${updateError.message}`);
        return;
      }

      setSuccess('Пользователь успешно удален из клиники');
      await loadUsers();
    } catch (err) {
      setError(`Ошибка: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    }
  };

  const handleSaveClinic = async () => {
    if (!profile?.clinic_id) return;

    setIsSavingClinic(true);
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
        setError(`Не удалось обновить клинику: ${updateError.message}`);
        return;
      }

      setSuccess('Клиника успешно обновлена');
      setIsEditingClinic(false);
      await refreshProfile();
    } catch (err) {
      setError(`Ошибка: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    } finally {
      setIsSavingClinic(false);
    }
  };

  const handleCancelClinic = () => {
    setIsEditingClinic(false);
    if (profile?.clinic) {
      setClinicName(profile.clinic.name || '');
      setClinicAddress(profile.clinic.address || '');
      setClinicPhone(profile.clinic.phone || '');
      setClinicEmail(profile.clinic.email || '');
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-4 h-4 text-primary" />;
      case 'specialist':
        return <UserIcon className="w-4 h-4 text-primary" />;
      case 'doctor': // Legacy support
        return <UserIcon className="w-4 h-4 text-primary" />;
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
      case 'specialist':
        return 'bg-primary/10 text-primary border-primary/20';
      case 'doctor': // Legacy support
        return 'bg-primary/10 text-primary border-primary/20';
      case 'assistant':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const translateRole = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Администратор';
      case 'specialist':
        return 'Специалист';
      case 'doctor': // Legacy support
        return 'Специалист';
      case 'assistant':
        return 'Ассистент';
      default:
        return role;
    }
  };

  // Show loading state if profile is not loaded yet
  if (!profile) {
    return (
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Only show for admins
  if (profile.role !== 'admin') {
    return (
      <div className="flex-1 p-6 overflow-auto">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Для доступа к этой странице необходимы права администратора.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
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

        {/* Clinic Information Card */}
        {profile?.clinic_id && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                    <CardTitle>Информация о клинике</CardTitle>
                  </div>
                  {profile?.clinic && !isEditingClinic && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingClinic(true)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Редактировать
                    </Button>
                  )}
                </div>
                <CardDescription>
                  Управление данными и настройками вашей клиники
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!profile?.clinic ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 text-muted-foreground mx-auto mb-4 animate-spin" />
                    <p className="text-muted-foreground">Загрузка информации о клинике...</p>
                  </div>
                ) : isEditingClinic ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="clinicName">Название клиники *</Label>
                      <Input
                        id="clinicName"
                        value={clinicName}
                        onChange={(e) => setClinicName(e.target.value)}
                        placeholder="Введите название клиники"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="clinicAddress">Адрес</Label>
                      <Input
                        id="clinicAddress"
                        value={clinicAddress}
                        onChange={(e) => setClinicAddress(e.target.value)}
                        placeholder="Введите адрес клиники"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="clinicPhone">Телефон</Label>
                      <Input
                        id="clinicPhone"
                        value={clinicPhone}
                        onChange={(e) => setClinicPhone(e.target.value)}
                        placeholder="Введите телефон клиники"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="clinicEmail">Email</Label>
                      <Input
                        id="clinicEmail"
                        type="email"
                        value={clinicEmail}
                        onChange={(e) => setClinicEmail(e.target.value)}
                        placeholder="Введите email клиники"
                      />
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button
                        onClick={handleSaveClinic}
                        disabled={isSavingClinic || !clinicName.trim()}
                      >
                        {isSavingClinic && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Сохранить изменения
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleCancelClinic}
                        disabled={isSavingClinic}
                      >
                        Отмена
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-muted-foreground">Название клиники</Label>
                      <p className="text-sm font-medium mt-1">{profile.clinic.name || 'Не задано'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Адрес</Label>
                      <p className="text-sm font-medium mt-1">{profile.clinic.address || 'Не задано'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Телефон</Label>
                      <p className="text-sm font-medium mt-1">{profile.clinic.phone || 'Не задано'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Email</Label>
                      <p className="text-sm font-medium mt-1">{profile.clinic.email || 'Не задано'}</p>
                    </div>
                    <div className="pt-4 border-t">
                      <Label className="text-muted-foreground">ID клиники</Label>
                      <p className="text-sm font-mono text-muted-foreground mt-1">{profile.clinic_id}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
        )}

        {/* Header with Add User button */}
        <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Пользователи клиники</h1>
              <p className="text-muted-foreground mt-1">
                Управление пользователями и их ролями в вашей клинике
              </p>
            </div>
            <Button onClick={() => setIsInviteDialogOpen(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Добавить пользователя
            </Button>
        </div>

        {/* Users List */}
        <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Пользователи ({users.length})
              </CardTitle>
              <CardDescription>
                Все пользователи, связанные с вашей клиникой
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
                  <p className="text-muted-foreground mb-4">Пользователи не найдены</p>
                  <Button onClick={() => setIsInviteDialogOpen(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Добавить первого пользователя
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
                          {user.specialization && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {getSpecializationName(user.specialization)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-1 rounded-md text-xs font-medium border flex items-center gap-1 ${getRoleBadgeColor(
                              user.role
                            )}`}
                          >
                            {getRoleIcon(user.role)}
                            <span>{translateRole(user.role)}</span>
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
                  Ожидающие приглашения ({invitations.length})
                </CardTitle>
                <CardDescription>
                  Пользователи, которым отправлено приглашение, но они еще не зарегистрировались
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
                            Истекает: {new Date(invitation.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded-md text-xs font-medium border ${getRoleBadgeColor(
                            invitation.role
                          )}`}
                        >
                          {translateRole(invitation.role)}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (confirm(`Отменить приглашение для ${invitation.email}?`)) {
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

      {/* Invite User Dialog */}
      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Пригласить пользователя в клинику</DialogTitle>
            <DialogDescription>
              Пригласите пользователя в вашу клинику по email. Он будет автоматически добавлен при регистрации.
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
              <Label htmlFor="invite-name">Полное имя</Label>
              <Input
                id="invite-name"
                value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)}
                placeholder="Иван Иванов"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Роль *</Label>
              <Select value={inviteRole} onValueChange={(value: 'specialist' | 'assistant') => setInviteRole(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="specialist">Специалист</SelectItem>
                  <SelectItem value="assistant">Ассистент</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {inviteRole === 'specialist' && (
              <div className="space-y-2">
                <Label htmlFor="invite-specialization">Специализация</Label>
                <Select value={inviteSpecialization || 'none'} onValueChange={setInviteSpecialization}>
                  <SelectTrigger id="invite-specialization">
                    <SelectValue placeholder="Выберите специализацию" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не указана</SelectItem>
                    {(() => {
                      try {
                        return getSpecializationList().map((spec) => (
                          <SelectItem key={spec.code} value={spec.code}>
                            {spec.name}
                          </SelectItem>
                        ));
                      } catch (err) {
                        console.error('Error loading specializations:', err);
                        return null;
                      }
                    })()}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsInviteDialogOpen(false);
                setInviteEmail('');
                setInviteFullName('');
                setInviteRole('specialist');
                setInviteSpecialization('');
              }}
            >
              Отмена
            </Button>
            <Button onClick={handleInviteUser} disabled={isInviting || !inviteEmail.trim()}>
              {isInviting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Добавить пользователя
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать пользователя</DialogTitle>
            <DialogDescription>
              Обновить информацию о пользователе и роль.
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
              <Label htmlFor="edit-name">Полное имя</Label>
              <Input
                id="edit-name"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                placeholder="Иван Иванов"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Роль *</Label>
              <Select
                value={editRole}
                onValueChange={(value: 'admin' | 'specialist' | 'assistant') => setEditRole(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Администратор</SelectItem>
                  <SelectItem value="specialist">Специалист</SelectItem>
                  <SelectItem value="assistant">Ассистент</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(editRole === 'specialist' || editRole === 'admin') && (
              <div className="space-y-2">
                <Label htmlFor="edit-specialization">Специализация</Label>
                <Select value={editSpecialization || 'none'} onValueChange={setEditSpecialization}>
                  <SelectTrigger id="edit-specialization">
                    <SelectValue placeholder="Выберите специализацию" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не указана</SelectItem>
                    {(() => {
                      try {
                        return getSpecializationList().map((spec) => (
                          <SelectItem key={spec.code} value={spec.code}>
                            {spec.name}
                          </SelectItem>
                        ));
                      } catch (err) {
                        console.error('Error loading specializations:', err);
                        return null;
                      }
                    })()}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingUser(null)}
            >
              Отмена
            </Button>
            <Button onClick={handleSaveUser} disabled={isSaving || !editEmail.trim()}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Сохранить изменения
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
