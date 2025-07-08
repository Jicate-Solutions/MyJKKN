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
        'group/bento shadow-input row-span-1 flex flex-col justify-between space-y-2 sm:space-y-4 rounded-xl border border-neutral-200 bg-white p-3 sm:p-4 transition duration-200 hover:shadow-xl dark:border-white/[0.2] dark:bg-black dark:shadow-none min-h-[200px] sm:min-h-[250px]',
        className
      )}
    >
      {header}
      <div className='transition duration-200 group-hover/bento:translate-x-2'>
        {icon}
        <div className='mt-1 sm:mt-2 mb-1 sm:mb-2 font-sans font-bold text-sm sm:text-base text-neutral-600 dark:text-neutral-200'>
          {title}
        </div>
        <div className='font-sans text-xs font-normal text-neutral-600 dark:text-neutral-300 leading-relaxed'>
          {description}
        </div>
      </div>
    </div>
  );
};
