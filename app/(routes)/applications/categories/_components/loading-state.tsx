// app/(routes)/applications/categories/_components/
import { BeatLoader } from 'react-spinners';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <div className='flex flex-col items-center justify-center p-8'>
      <BeatLoader color='#00e902' />
      <p className='mt-4 text-sm text-muted-foreground'>{message}</p>
    </div>
  );
}
