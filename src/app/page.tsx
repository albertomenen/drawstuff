import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/editor');
  // Optional: You could return null or a loading message here,
  // but redirect() should prevent rendering.
  // return <div>Redirecting to editor...</div>;
}
