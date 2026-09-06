#!/usr/bin/env python3
"""Test Topics dropdown visibility in the Minutes tab"""

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Navigate to the meeting page
    print("Navigating to meeting page...")
    page.goto('http://localhost:3000/bos/meetings/c49089b3-f394-4b95-880d-d41b4a14d22f')
    page.wait_for_load_state('networkidle')

    # Take initial screenshot to see the page state
    print("Taking initial screenshot...")
    page.screenshot(path='/tmp/meeting_page_initial.png', full_page=True)

    # Click the Minutes tab
    print("Clicking Minutes tab...")
    minutes_tab = page.locator('button[role="tab"]:has-text("Minutes")')
    if minutes_tab.is_visible():
        minutes_tab.click()
        page.wait_for_load_state('networkidle')

    # Take screenshot after opening Minutes tab
    page.screenshot(path='/tmp/minutes_tab_opened.png', full_page=True)

    # Scroll to find Change #6
    print("Scrolling to find Change #6...")
    # Look for the change header
    change_6 = page.locator('text="Change #6"')
    if change_6.is_visible():
        change_6.scroll_into_view()
        page.wait_for_timeout(500)

    # Take screenshot showing Change #6
    page.screenshot(path='/tmp/change_6_found.png', full_page=True)

    # Click the Topics dropdown
    print("Clicking Topics dropdown...")
    # Find the Topics field - it's in a grid with Unit and Sub-topics
    # The Topics button should be the middle one in the lg:grid-cols-3
    all_buttons = page.locator('button[role="combobox"]')
    print(f"Found {all_buttons.count()} combobox buttons")

    # Find the button that's in the Topics column (the second one in the change row)
    # Let's click on the button that has "Search topic..." placeholder nearby
    topic_buttons = page.locator('//div[contains(@class, "grid") and contains(@class, "lg:grid-cols-3")]//button[@role="combobox"]')
    print(f"Found {topic_buttons.count()} topic buttons")

    if topic_buttons.count() > 1:
        # Click the second button (Topics, not Unit)
        topic_buttons.nth(1).click()
        page.wait_for_timeout(500)

    # Take screenshot showing the dropdown with options
    print("Taking screenshot of Topics dropdown...")
    page.screenshot(path='/tmp/topics_dropdown_open.png', full_page=True)

    # Also try to get the actual content
    print("\nAnalyzing dropdown content...")
    dropdown_items = page.locator('[role="option"]')
    print(f"Found {dropdown_items.count()} option items")

    for i in range(min(5, dropdown_items.count())):
        item = dropdown_items.nth(i)
        text = item.text_content()
        print(f"  Option {i}: {text}")

    browser.close()
    print("\nDone! Screenshots saved to /tmp/")
