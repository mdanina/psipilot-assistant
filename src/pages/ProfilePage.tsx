import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Loader2, CheckCircle2, AlertCircle, X, Edit } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ProfilePage() {
  const { profile, user, refreshProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form state
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [email, setEmail] = useState(profile?.email || user?.email || '');

  // Update form state when profile loads
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setEmail(profile.email || user?.email || '');
    }
  }, [profile, user]);

  const handleSave = async () => {
    if (!profile) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim() || null,
          email: email.trim(),
        })
        .eq('id', profile.id);

      if (updateError) {
        setError(`Не удалось обновить профиль: ${updateError.message}`);
        return;
      }

      setSuccess('Профиль успешно обновлен');
      setIsEditing(false);
      await refreshProfile();
    } catch (err) {
      setError(`Ошибка: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Header title="Профиль" icon={<User className="w-5 h-5" />} />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
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

          {/* User Profile Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <CardTitle>Мой профиль</CardTitle>
                </div>
                {!isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Редактировать
                  </Button>
                )}
              </div>
              <CardDescription>Ваша личная информация и данные аккаунта</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Полное имя</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Введите ваше полное имя"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Введите ваш email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Роль</Label>
                    <Input
                      value={profile?.role === 'admin' ? 'Администратор' : profile?.role === 'doctor' ? 'Врач' : profile?.role === 'assistant' ? 'Ассистент' : profile?.role || 'Н/Д'}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>ID пользователя</Label>
                    <Input
                      value={profile?.id || user?.id || 'Н/Д'}
                      disabled
                      className="bg-muted font-mono text-sm"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                    >
                      {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Сохранить изменения
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setFullName(profile?.full_name || '');
                        setEmail(profile?.email || user?.email || '');
                        setError(null);
                        setSuccess(null);
                      }}
                      disabled={isSaving}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Отмена
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label className="text-muted-foreground">Полное имя</Label>
                    <p className="text-sm font-medium">{profile?.full_name || 'Не задано'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Email</Label>
                    <p className="text-sm font-medium">{profile?.email || user?.email || 'Н/Д'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Роль</Label>
                    <p className="text-sm font-medium">{profile?.role === 'admin' ? 'Администратор' : profile?.role === 'doctor' ? 'Врач' : profile?.role === 'assistant' ? 'Ассистент' : profile?.role || 'Н/Д'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">ID пользователя</Label>
                    <p className="text-sm font-mono text-muted-foreground">{profile?.id || user?.id || 'Н/Д'}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

