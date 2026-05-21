'use client';

import { useEffect, useRef, useState } from 'react';

type Settings = {
  displayName: string;
  email: string;
  avatarDataUrl?: string | null;
};

const STORAGE_KEY = 'webster.profile.settings.v1';

const defaultSettings: Settings = {
  displayName: '',
  email: '',
  avatarDataUrl: null,
};

export default function ProfilePage() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [section, setSection] = useState<'profile' | 'subscription'>('profile');
  const [promoCode, setPromoCode] = useState('');
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (raw) {
        setSettings(JSON.parse(raw));
        setSavedAt(new Date().toLocaleString());
      }
    } catch {
      // ignore
    }
  }, []);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setSavedAt(new Date().toLocaleString());
      window.alert('Налаштування збережено локально.');
    } catch (err) {
      window.alert('Не вдалося зберегти налаштування.');
    }
  }

  function resetToDefaults() {
    setSettings(defaultSettings);
    localStorage.removeItem(STORAGE_KEY);
    setSavedAt(null);
  }

  return (
    <main className='min-h-screen bg-[#0f1213] py-12 px-6 text-[#e7e9ec]'>
      <div className='mx-auto w-[min(980px,100%)]'>
        <header className='mb-8 text-center'>
          <h1 className='bg-linear-to-r from-[#4aa391] via-[#6fd6c1] to-[#d9f5ee] bg-clip-text text-transparent text-4xl font-extrabold'>
            Settings
          </h1>
          <p className='mt-2 text-sm text-[#9aa1ab]'>
            Manage your profile and subscription.
          </p>
        </header>

        <div className='grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]'>
          <nav className='rounded-xl border border-[#273230] bg-[#0f1413] p-4'>
            <ul className='flex flex-col gap-2'>
              <li>
                <button
                  className={`w-full rounded-md px-3 py-2 text-left font-semibold ${section === 'profile' ? 'bg-[#152a26] text-[#dff3ea]' : 'text-[#9aa1ab] hover:bg-[#0f201b]'}`}
                  onClick={() => setSection('profile')}
                >
                  Profile
                </button>
              </li>
              <li>
                <button
                  className={`w-full rounded-md px-3 py-2 text-left font-semibold ${section === 'subscription' ? 'bg-[#152a26] text-[#dff3ea]' : 'text-[#9aa1ab] hover:bg-[#0f201b]'}`}
                  onClick={() => setSection('subscription')}
                >
                  Subscription
                </button>
              </li>
            </ul>
          </nav>

          <div>
            {section === 'profile' ? (
              <section className='rounded-xl border border-[#273230] bg-[#0f1413] p-6'>
                <h2 className='mb-4 text-lg font-bold text-[#f2f4f7]'>
                  Profile
                </h2>

                <div className='mb-4 flex items-center gap-4'>
                  <div className='relative'>
                    <div className='h-20 w-20 overflow-hidden rounded-full border border-[#30353d] bg-[#0b0d0d]'>
                      {settings.avatarDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={settings.avatarDataUrl}
                          alt='avatar'
                          className='h-full w-full object-cover'
                        />
                      ) : (
                        <div className='grid h-full w-full place-items-center text-sm text-[#9aa1ab]'>
                          No avatar
                        </div>
                      )}
                    </div>
                    <input
                      ref={avatarInputRef}
                      type='file'
                      accept='image/*'
                      className='hidden'
                      onChange={(e) => {
                        const file = e.target.files?.[0];

                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            const result = reader.result as
                              | string
                              | ArrayBuffer
                              | null;

                            if (typeof result === 'string') {
                              update('avatarDataUrl', result);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </div>

                  <div className='flex flex-col gap-2'>
                    <button
                      type='button'
                      onClick={() => avatarInputRef.current?.click()}
                      className='rounded-4xl border border-[#4aa391] bg-[#203731] px-3 py-1 text-sm font-semibold text-[#eef1f4]'
                    >
                      Upload avatar
                    </button>
                    <button
                      type='button'
                      onClick={() => update('avatarDataUrl', null)}
                      className='rounded-4xl border border-[#3a414a] bg-transparent px-3 py-1 text-sm font-semibold text-[#9aa1ab]'
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <label className='mb-2 block text-xs font-semibold text-[#9aa1ab]'>
                  Display name
                </label>
                <input
                  value={settings.displayName}
                  onChange={(e) => update('displayName', e.target.value)}
                  className='mb-4 w-full rounded-md border border-[#30353d] bg-[#0b0d0d] px-3 py-2 text-sm text-[#eef1f4]'
                  placeholder='How others see you'
                />

                <label className='mb-2 block text-xs font-semibold text-[#9aa1ab]'>
                  Email
                </label>
                <input
                  value={(settings as Settings).email}
                  onChange={(e) => update('email', e.target.value)}
                  className='mb-4 w-full rounded-md border border-[#30353d] bg-[#0b0d0d] px-3 py-2 text-sm text-[#eef1f4]'
                  placeholder='you@example.com'
                />

                <div className='mb-4 flex flex-col gap-3'>
                  <button
                    onClick={() =>
                      window.alert('Password reset email sent (demo).')
                    }
                    className='w-full rounded-4xl border border-[#3a414a] bg-transparent px-4 py-2 font-bold text-[#9aa1ab] hover:border-[#4aa391]'
                  >
                    Change password (send email)
                  </button>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          'Are you sure you want to delete your account? This is a demo action.',
                        )
                      ) {
                        resetToDefaults();
                        window.alert('Account deleted (demo).');
                      }
                    }}
                    className='w-full rounded-4xl border border-[#5a2a2a] bg-transparent px-4 py-2 font-bold text-[#ffb9b9] hover:border-[#ffb9b9]'
                  >
                    Delete account
                  </button>
                </div>

                <div className='flex gap-3'>
                  <button
                    onClick={save}
                    className='min-w-40 rounded-4xl border border-[#4aa391] bg-[#203731] px-4 py-2 font-extrabold text-[#eef1f4]'
                  >
                    Save
                  </button>
                  <button
                    onClick={resetToDefaults}
                    className='min-w-40 rounded-4xl border border-[#3a414a] bg-transparent px-4 py-2 font-bold text-[#9aa1ab]'
                  >
                    Reset
                  </button>
                </div>

                {savedAt ? (
                  <p className='mt-3 text-xs text-[#8b929b]'>
                    Last saved: {savedAt}
                  </p>
                ) : null}
              </section>
            ) : (
              <section className='rounded-xl border border-[#273230] bg-[#0f1413] p-6'>
                <h2 className='mb-4 text-lg font-bold text-[#f2f4f7]'>
                  Subscription
                </h2>

                <label className='mb-2 block text-xs font-semibold text-[#9aa1ab]'>
                  Promo code
                </label>
                <div className='mb-4 flex gap-2'>
                  <input
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className='flex-1 rounded-md border border-[#30353d] bg-[#0b0d0d] px-3 py-2 text-sm text-[#eef1f4]'
                    placeholder='Enter promo code'
                  />
                  <button
                    onClick={() =>
                      window.alert(
                        promoCode
                          ? `Applied promo: ${promoCode} (demo)`
                          : 'Please enter a promo code.',
                      )
                    }
                    className='rounded-4xl border border-[#4aa391] bg-[#203731] px-4 py-2 font-extrabold text-[#eef1f4]'
                  >
                    Apply
                  </button>
                </div>

                <div className='mb-4'>
                  <button
                    onClick={() =>
                      window.alert('Redirecting to payment (demo)')
                    }
                    className='w-full rounded-4xl border border-[#4aa391] bg-[#203731] px-4 py-2 font-extrabold text-[#eef1f4]'
                  >
                    Pay
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
