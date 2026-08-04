import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useProfile } from '@/lib/useProfile';

export default function Home() {
  const router = useRouter();
  const { loading, profile } = useProfile();

  useEffect(() => {
    if (loading) return;
    if (!profile) return; // useProfile сам редіректить на /login
    router.replace(profile.role === 'admin' ? '/admin' : '/courses');
  }, [loading, profile, router]);

  return null;
}
