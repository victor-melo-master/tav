import { redirect } from 'next/navigation';

/** La raíz manda al tablero; el guard del panel redirige a /login si hace falta. */
export default function Home() {
  redirect('/tablero');
}
