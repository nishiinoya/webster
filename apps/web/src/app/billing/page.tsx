'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getMySubscription,
  listPayments,
  listSubscriptionPlans,
  openBillingPortal,
  startCheckout,
  type PaymentRecord,
  type SubscriptionPlan,
} from '@/editor/collaboration/sharedProjectApi';
import { useSubscription } from '@/editor/collaboration/useSubscription';

const MAX_SUCCESS_POLLS = 5;

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <main className='min-h-screen bg-[#0f1213] py-12 px-6 text-sm text-[#9aa1ab]'>
          Loading billing...
        </main>
      }
    >
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isPro, loading, error, refresh } = useSubscription();

  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    listSubscriptionPlans()
      .then((response) => {
        if (!cancelled) {
          setPlans(response.plans);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPlansError(err instanceof Error ? err.message : 'Unable to load plans.');
          setPlans([]);
        }
      });

    listPayments()
      .then((response) => {
        if (!cancelled) {
          setPayments(response.payments);
        }
      })
      .catch(() => {
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (searchParams.get('status') !== 'success') {
      return;
    }

    setShowSuccess(true);
    let cancelled = false;
    let tries = 0;

    const tick = async () => {
      tries += 1;

      try {
        const info = await getMySubscription();
        if (!cancelled && info.isPro) {
          await refresh();
          await reloadPayments();
          return;
        }
      } catch {
      }

      if (!cancelled && tries < MAX_SUCCESS_POLLS) {
        window.setTimeout(() => void tick(), 2000);
      } else if (!cancelled) {
        void refresh();
      }
    };

    void tick();

    router.replace('/billing');

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadPayments() {
    try {
      const response = await listPayments();
      setPayments(response.payments);
    } catch {
    }
  }

  async function upgrade(priceId: string) {
    setActionError(null);
    setBusy(true);
    try {
      const origin = window.location.origin;
      const { url } = await startCheckout(
        priceId,
        `${origin}/billing?status=success`,
        `${origin}/billing?status=cancel`,
      );
      window.location.assign(url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to start checkout.');
      setBusy(false);
    }
  }

  async function manageBilling() {
    setActionError(null);
    setBusy(true);
    try {
      const { url } = await openBillingPortal(`${window.location.origin}/billing`);
      window.location.assign(url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to open billing portal.');
      setBusy(false);
    }
  }

  const visiblePlans = (plans ?? []).filter((plan) => plan.interval === interval);
  const billingNotConfigured = plans !== null && plans.length === 0;

  return (
    <main className='min-h-screen bg-[#0f1213] py-12 px-6 text-[#e7e9ec]'>
      <div className='mx-auto w-[min(980px,100%)]'>
        <div className='mb-6'>
          <Link
            href='/'
            className='inline-flex items-center gap-2 rounded-md border border-[#273230] bg-[#0f1413] px-3 py-2 text-sm font-semibold text-[#9aa1ab] hover:border-[#4aa391] hover:text-[#dff3ea]'
          >
            ← Home
          </Link>
        </div>
        <header className='mb-8 text-center'>
          <h1 className='bg-linear-to-r from-[#4aa391] via-[#6fd6c1] to-[#d9f5ee] bg-clip-text text-transparent text-4xl font-extrabold'>
            Billing
          </h1>
          <p className='mt-2 text-sm text-[#9aa1ab]'>
            Manage your Webster subscription and payments.
          </p>
        </header>

        {showSuccess ? (
          <div className='mb-6 rounded-xl border border-[#31584f] bg-[#13231f] p-4 text-sm font-semibold text-[#a9e2d2]'>
            Payment received. Your Pro features will activate momentarily.
          </div>
        ) : null}

        {loading ? (
          <section className='rounded-xl border border-[#273230] bg-[#0f1413] p-6 text-sm text-[#9aa1ab]'>
            Loading subscription...
          </section>
        ) : error ? (
          <section className='rounded-xl border border-[#273230] bg-[#0f1413] p-6 text-sm font-bold text-[#ffb9b9]'>
            {error}
          </section>
        ) : (
          <div className='grid gap-6'>
            { }
            <section className='rounded-xl border border-[#273230] bg-[#0f1413] p-6'>
              <h2 className='mb-4 text-lg font-bold text-[#f2f4f7]'>Current plan</h2>
              <div className='flex flex-wrap items-center gap-3'>
                <span className='rounded-md border border-[#3b424b] bg-[#202329] px-3 py-1 text-sm font-extrabold uppercase text-[#cfd4da]'>
                  {isPro ? 'Pro' : 'Free'}
                </span>
                {data?.status ? (
                  <span className='text-sm text-[#9aa1ab]'>Status: {data.status}</span>
                ) : null}
                {data?.currentPeriodEnd ? (
                  <span className='text-sm text-[#9aa1ab]'>
                    {data.status === 'canceled' ? 'Ends' : 'Renews'}:{' '}
                    {formatDate(data.currentPeriodEnd)}
                  </span>
                ) : null}
              </div>
              <p className='mt-3 text-sm text-[#9aa1ab]'>
                Projects used: {data?.usage.projectCount ?? 0}
                {data?.limits.maxProjects != null
                  ? ` of ${data.limits.maxProjects}`
                  : ''}
              </p>

              {isPro ? (
                <div className='mt-4'>
                  <button
                    onClick={manageBilling}
                    disabled={busy}
                    className='min-w-40 rounded-4xl border border-[#4aa391] bg-[#203731] px-4 py-2 font-extrabold text-[#eef1f4] disabled:opacity-60'
                  >
                    {busy ? 'Opening...' : 'Manage billing'}
                  </button>
                </div>
              ) : null}

              {actionError ? (
                <p className='mt-3 text-sm font-bold text-[#ffb9b9]'>{actionError}</p>
              ) : null}
            </section>

            { }
            {!isPro ? (
              <section className='rounded-xl border border-[#273230] bg-[#0f1413] p-6'>
                <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
                  <h2 className='text-lg font-bold text-[#f2f4f7]'>Upgrade to Pro</h2>
                  {!billingNotConfigured ? (
                    <div className='flex gap-2'>
                      <IntervalToggle
                        active={interval === 'month'}
                        onClick={() => setInterval('month')}
                      >
                        Monthly
                      </IntervalToggle>
                      <IntervalToggle
                        active={interval === 'year'}
                        onClick={() => setInterval('year')}
                      >
                        Yearly
                      </IntervalToggle>
                    </div>
                  ) : null}
                </div>

                {plans === null ? (
                  <p className='text-sm text-[#9aa1ab]'>Loading plans...</p>
                ) : billingNotConfigured ? (
                  <p className='text-sm text-[#9aa1ab]'>
                    Billing isn&apos;t configured yet. Check back soon.
                  </p>
                ) : (
                  <>
                    <div className='grid gap-3 sm:grid-cols-2'>
                      {visiblePlans.map((plan) => (
                        <div
                          key={plan.priceId}
                          className='rounded-xl border border-[#30353d] bg-[#0b0d0d] p-5'
                        >
                          <p className='text-sm font-semibold text-[#9aa1ab]'>
                            {plan.productName ?? 'Webster Pro'}
                          </p>
                          <p className='mt-1 text-2xl font-extrabold text-[#eef1f4]'>
                            {formatAmount(plan.amount, plan.currency)}
                            <span className='text-sm font-semibold text-[#9aa1ab]'>
                              {' '}
                              / {plan.interval}
                            </span>
                          </p>
                          <button
                            onClick={() => upgrade(plan.priceId)}
                            disabled={busy}
                            className='mt-4 w-full rounded-4xl border border-[#4aa391] bg-[#203731] px-4 py-2 font-extrabold text-[#eef1f4] disabled:opacity-60'
                          >
                            {busy ? 'Redirecting...' : 'Upgrade to Pro'}
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className='mt-4 text-xs text-[#8b929b]'>
                      Have a promo code? Apply it at checkout.
                    </p>
                  </>
                )}

                {plansError ? (
                  <p className='mt-3 text-sm font-bold text-[#ffb9b9]'>{plansError}</p>
                ) : null}
              </section>
            ) : null}

            { }
            <section className='rounded-xl border border-[#273230] bg-[#0f1413] p-6'>
              <h2 className='mb-4 text-lg font-bold text-[#f2f4f7]'>Payment history</h2>
              {payments.length === 0 ? (
                <p className='text-sm text-[#9aa1ab]'>No payments yet.</p>
              ) : (
                <div className='overflow-x-auto'>
                  <table className='w-full text-left text-sm'>
                    <thead>
                      <tr className='text-xs uppercase text-[#8b929b]'>
                        <th className='py-2 pr-4 font-semibold'>Amount</th>
                        <th className='py-2 pr-4 font-semibold'>Date</th>
                        <th className='py-2 font-semibold'>Transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.id} className='border-t border-[#273230]'>
                          <td className='py-2 pr-4 font-semibold text-[#eef1f4]'>
                            {formatAmountString(payment.amount, payment.currency)}
                          </td>
                          <td className='py-2 pr-4 text-[#9aa1ab]'>
                            {formatDate(payment.createdAt)}
                          </td>
                          <td className='py-2 font-mono text-xs text-[#8b929b]'>
                            {payment.providerTxId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        <div className='mt-6 text-center'>
          <Link href='/profile' className='text-sm font-semibold text-[#4aa391] hover:underline'>
            Back to settings
          </Link>
        </div>
      </div>
    </main>
  );
}

function IntervalToggle({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`rounded-4xl border px-4 py-1.5 text-sm font-semibold ${
        active
          ? 'border-[#4aa391] bg-[#203731] text-[#eef1f4]'
          : 'border-[#30353d] bg-[#0b0d0d] text-[#9aa1ab]'
      }`}
    >
      {children}
    </button>
  );
}

function formatDate(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString() : value;
}

function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatAmountString(amount: string, currency: string) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return `${amount} ${currency.toUpperCase()}`;
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${currency.toUpperCase()}`;
  }
}
