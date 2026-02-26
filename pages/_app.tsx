import '@/styles/base.css';
import type { AppProps } from 'next/app';
import { Space_Grotesk } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
});

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <main className={spaceGrotesk.variable}>
        <Component {...pageProps} />
      </main>
    </>
  );
}

export default MyApp;
