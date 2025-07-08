'use client'; // Recommended for not-found to allow interactive elements like a redirect button

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <section className='page_404 bg-white py-10 px-0 font-arvo flex items-center justify-center min-h-screen'>
      <div className='container mx-auto'>
        <div className='flex justify-center'>
          <div className='w-full sm:w-10/12 text-center'>
            <div
              className='four_zero_four_bg bg-center bg-no-repeat h-[400px]'
              style={{
                backgroundImage:
                  'url(https://cdn.dribbble.com/users/285475/screenshots/2083086/dribbble_1.gif)'
              }}
            >
              <h1 className='text-center text-7xl md:text-8xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500'>
                404
              </h1>
            </div>

            <div className='contant_box_404 -mt-[50px]'>
              <h3 className='text-2xl md:text-3xl font-semibold mt-0 mb-4'>
                Look like you&apos;re lost
              </h3>

              <p className='text-base md:text-lg text-gray-600 mb-6'>
                The page you are looking for is not available!
              </p>

              <Link href='/' passHref>
                <Button
                  variant='default'
                  size='lg'
                  className='link_404 text-white bg-green-500 hover:bg-green-600 py-2.5 px-5 my-5 inline-block rounded-md no-underline'
                >
                  Go to Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
