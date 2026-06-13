from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Navigate to the meetings page
    # Using localhost:3001 as Next.js dev server default
    page.goto('http://localhost:3001/bos/meetings/c49089b3-f394-4b95-880d-d41b4a1dd22f')

    # Wait for the page to fully load
    page.wait_for_load_state('networkidle')
    time.sleep(2)

    # Take a screenshot to inspect the result
    page.screenshot(path='/tmp/meetings-distance-test.png', full_page=True)

    # Check the page content for the distance field
    content = page.content()

    # Look for the "Distance not assigned" text
    has_distance_error = 'Distance not assigned' in content

    # Get all attendance entries visible (using CSS selector)
    attendance_rows = page.locator('div.flex.items-center.gap-3.rounded-lg.border').all()

    print(f"Total attendance rows found: {len(attendance_rows)}")
    print(f"Page still has 'Distance not assigned' error: {has_distance_error}")

    # Check each row for distance/TA/DA badges
    for i, row in enumerate(attendance_rows):
        try:
            # Get the member name from the row
            name_elem = row.locator('p.text-sm.font-medium').first
            member_name = name_elem.text_content() if name_elem else "Unknown"

            # Get all badges/spans in the row
            badges = row.locator('span.px-2.py-0\\.5.rounded.border').all()
            print(f"Row {i} ({member_name}): Found {len(badges)} badges")
            for badge in badges:
                badge_text = badge.text_content().strip()
                print(f"  - {badge_text}")
        except Exception as e:
            print(f"Row {i}: Error inspecting - {str(e)}")
            pass

    # Save the page content for inspection
    with open('/tmp/meetings-distance-content.html', 'w') as f:
        f.write(content)

    print("\nScreenshot saved to: /tmp/meetings-distance-test.png")
    print("HTML content saved to: /tmp/meetings-distance-content.html")

    browser.close()
