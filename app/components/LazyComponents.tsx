import dynamic from 'next/dynamic';

// Lazy load heavy components
export const DayPickerLazy = dynamic(
  () => import('react-day-picker').then(mod => ({ default: mod.DayPicker })),
  {
    loading: () => <div className="animate-pulse bg-gray-200 h-80 rounded-2xl" />,
    ssr: false,
  }
);

export const LoadingScreenLazy = dynamic(
  () => import('./LoadingScreen'),
  { ssr: false }
);
