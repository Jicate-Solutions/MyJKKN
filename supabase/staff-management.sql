-- Create employment_categories table
create table employment_categories (
  id uuid primary key default uuid_generate_v4(),
  category_name text not null,
  description text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

-- Add RLS policies
alter table employment_categories enable row level security;

create policy "Enable read access for authenticated users" on employment_categories
  for select using (auth.role() = 'authenticated');

create policy "Enable insert access for authenticated users" on employment_categories
  for insert with check (auth.role() = 'authenticated');

create policy "Enable update access for authenticated users" on employment_categories
  for update using (auth.role() = 'authenticated');

create policy "Enable delete access for authenticated users" on employment_categories
  for delete using (auth.role() = 'authenticated');