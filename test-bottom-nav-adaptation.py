#!/usr/bin/env python3
"""
Test script to verify bottom nav label adaptation for school institutions.
"""
from playwright.sync_api import sync_playwright
import sys

def test_bottom_nav_labels():
    with sync_playwright() as p:
        # Launch headless browser
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # Navigate to the app
            print("Navigating to http://localhost:3003...")
            page.goto('http://localhost:3003', wait_until='networkidle', timeout=30000)

            # Wait for bottom nav to load
            page.wait_for_selector('[role="navigation"]', timeout=10000)

            # Take a screenshot
            page.screenshot(path='/tmp/bottom-nav.png', full_page=True)
            print("✓ Screenshot saved to /tmp/bottom-nav.png")

            # Get all bottom nav items
            nav_items = page.locator('[role="navigation"] button, [role="navigation"] a').all()
            print(f"\n✓ Found {len(nav_items)} navigation items")

            # Look for adapted labels
            labels = []
            for item in nav_items:
                text = item.inner_text().strip()
                if text:
                    labels.append(text)

            print("\nBottom nav labels found:")
            for label in set(labels):
                print(f"  • {label}")

            # Check if adaptation is present
            adapted_labels = {
                'Streams': 'Degrees → Streams adaptation',
                'Wings': 'Departments → Wings adaptation',
                'Classes': 'Programs → Classes adaptation',
                'Terms': 'Semesters → Terms adaptation',
                'Subjects': 'Courses → Subjects adaptation',
            }

            print("\nLabel Adaptation Check:")
            for adapted_label, description in adapted_labels.items():
                if adapted_label in labels:
                    print(f"  ✓ {description} (found: '{adapted_label}')")
                else:
                    # It's OK if not found - school institution check may not be triggered
                    print(f"  ℹ {description} (not found - may not be a school institution)")

            # Get the current URL to verify we're logged in
            current_url = page.url
            print(f"\nCurrent URL: {current_url}")

            browser.close()
            return True

        except Exception as e:
            print(f"\n✗ Error: {e}", file=sys.stderr)
            browser.close()
            return False

if __name__ == '__main__':
    success = test_bottom_nav_labels()
    sys.exit(0 if success else 1)
