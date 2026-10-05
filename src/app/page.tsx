import VisorNave3D from '@/components/gemelo/VisorNave3D';

export const metadata = {
  title: 'Centro de Simuladores — Gemelo Digital SCADA 3D',
  description:
    'Gemelo Digital 3D en tiempo real para supervisión y telemetría de simuladores industriales pesados con control cinemático de operarios.',
};

export default function Home() {
  return (
    <main className="w-full h-screen overflow-hidden bg-[#111216]">
      <VisorNave3D />
    </main>
  );
}
