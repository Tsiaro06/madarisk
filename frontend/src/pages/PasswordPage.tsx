import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

export function PasswordPage() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const mutate = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast('Mot de passe mis à jour', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur';
      toast(msg, 'error');
      alert(msg);
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      toast('Les mots de passe ne correspondent pas', 'error');
      return;
    }
    mutate.mutate();
  };

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="font-display text-3xl text-ink">Mot de passe</h1>
        <p className="text-sm text-muted">Modifier vos identifiants d&apos;accès</p>
      </div>
      <Card>
        <form className="space-y-3" onSubmit={onSubmit}>
          <Input
            label="Mot de passe actuel"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <Input
            label="Nouveau mot de passe"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
          <Input
            label="Confirmation"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
          <Button type="submit" loading={mutate.isPending}>
            Enregistrer
          </Button>
        </form>
      </Card>
    </div>
  );
}
