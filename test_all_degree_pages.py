from playwright.sync_api import sync_playwright
import os

def create_screenshot_dir():
    os.makedirs('/tmp/degree_test_screenshots', exist_ok=True)

def test_page(browser, url, page_name, expected_labels):
    """Test a page for expected labels"""
    page = browser.new_page()
    page.goto(f'http://localhost:3000{url}')
    page.wait_for_load_state('networkidle')

    content = page.content()

    # Take screenshot
    page.screenshot(path=f'/tmp/degree_test_screenshots/{page_name}.png', full_page=True)

    print(f"\n=== {page_name.upper()} PAGE ===")
    all_found = True
    for label in expected_labels:
        found = label in content
        status = "[OK]" if found else "[FAIL]"
        print(f"{status} '{label}' found: {found}")
        if not found:
            all_found = False

    page.close()
    return all_found

with sync_playwright() as p:
    create_screenshot_dir()
    browser = p.chromium.launch(headless=True)

    # Test Detail Page
    detail_labels = ['Stream ID', 'Stream Name', 'Stream Details', 'Edit Stream']
    detail_ok = test_page(
        browser,
        '/organizations/degrees/02e2925a-069d-4050-8829-deebf6fcac0c',
        'detail_page',
        detail_labels
    )

    # Test Edit Page
    edit_labels = ['Edit Stream', 'Stream ID', 'Stream Name']
    edit_ok = test_page(
        browser,
        '/organizations/degrees/02e2925a-069d-4050-8829-deebf6fcac0c/edit',
        'edit_page',
        edit_labels
    )

    # Test Add/New Page
    new_labels = ['Stream ID', 'Stream Name']
    new_ok = test_page(
        browser,
        '/organizations/degrees/new',
        'new_page',
        new_labels
    )

    browser.close()

    print("\n=== SUMMARY ===")
    print(f"Detail Page: {'PASS' if detail_ok else 'FAIL'}")
    print(f"Edit Page: {'PASS' if edit_ok else 'FAIL'}")
    print(f"New Page: {'PASS' if new_ok else 'FAIL'}")
    print(f"\nScreenshots saved to /tmp/degree_test_screenshots/")
