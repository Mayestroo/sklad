import { ConfirmRegistration } from './ConfirmRegistration';

/**
 * /register/confirm?token=… (D3). The token is read from the page's
 * searchParams on the server and passed down, so the client component needs
 * no useSearchParams (and no Suspense boundary).
 */
export default async function ConfirmRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <ConfirmRegistration token={typeof token === 'string' && token ? token : null} />;
}
