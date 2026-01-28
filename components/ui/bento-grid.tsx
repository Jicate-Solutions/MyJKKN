import { cn } from '@/lib/utils';

export const BentoGrid = ({
  className,
  children
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        'mx-auto grid max-w-7xl grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 md:auto-rows-[16rem] lg:auto-rows-[18rem] lg:grid-cols-3',
        className
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        'group/bento row-span-1 flex flex-col justify-between space-y-2 sm:space-y-4',
        'rounded-2xl p-3 sm:p-4 min-h-[200px] sm:min-h-[250px]',
        'backdrop-blur-xl bg-white/70 dark:bg-black/40',
        'border border-white/20 dark:border-white/10',
        'transition-all duration-500 ease-out',
        'hover:bg-white/85 dark:hover:bg-black/50',
        'hover:-translate-y-2 hover:scale-[1.02]',
        'relative overflow-hidden',
        className
      )}
      style={{
        boxShadow: 'var(--glass-shadow-md)'
      }}
    >
      {/* Glass refraction overlay */}
      <div className='absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent dark:from-white/5 pointer-events-none' />

      {/* Shimmer effect on hover */}
      <div className='absolute inset-0 opacity-0 group-hover/bento:opacity-100 transition-opacity duration-700 pointer-events-none overflow-hidden'>
        <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent dark:via-white/10 -translate-x-full group-hover/bento:translate-x-full transition-transform duration-1000 ease-out' />
      </div>

      <div className='relative z-10'>
        {header}
      </div>
      <div className='transition-all duration-300 group-hover/bento:translate-x-2 relative z-10'>
        {icon}
        <div className='mt-1 sm:mt-2 mb-1 sm:mb-2 font-sans font-bold text-sm sm:text-base bg-clip-text text-transparent bg-gradient-to-r from-neutral-700 to-neutral-600 dark:from-neutral-100 dark:to-neutral-200'>
          {title}
        </div>
        <div className='font-sans text-xs font-normal text-neutral-600 dark:text-neutral-300 leading-relaxed'>
          {description}
        </div>
      </div>
    </div>
  );
};
