#!/usr/bin/env python3
"""
Y8.com Grid Scraper - Fixed Version

A robust web scraper for extracting game data from Y8.com category pages.
Uses Playwright for browser automation with proper error handling,
rate limiting, and data validation.

Usage:
    python OBcWUMC2-Y8_grid_scraper_fixed.py

Requirements:
    - playwright>=1.40.0
    - Install with: pip install playwright && playwright install
"""

import json
import logging
import os
import random
import signal
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

from playwright.sync_api import Page, Playwright, Browser, BrowserContext, sync_playwright

# Constants
BASE_URL = "https://y8.com"
ALTERNATE_BASE_URL = "https://www.y8.com"
DEFAULT_TIMEOUT_MS = 30000
PAGE_LOAD_TIMEOUT_MS = 60000
MAX_RETRIES = 3
REQUEST_DELAY_MIN = 1.5
REQUEST_DELAY_MAX = 3.0
ITEMS_PER_PAGE_THRESHOLD = 72
OUTPUT_DIR = "output"

# Available categories list
CATEGORIES = [
    "driving_racing",
    "shooting",
    "girls",
    "thinking",
    "sports",
    "adventure_rpg",
    "skill",
    "arcade_classic",
    "management",
    "fun",
    "action_fighting",
    "strategy_defense",
    "kids_educational",
]

# User agents for rotation
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("grid_scraper.log"),
    ],
)
logger = logging.getLogger(__name__)


@dataclass
class ScrapedItem:
    """Represents a single scraped game item."""
    title: str
    url: str
    tags: str
    image: str
    video: str
    category: str
    source_url: str

    def to_dict(self) -> Dict[str, str]:
        """Convert to dictionary for JSON serialization."""
        return {
            "Title": self.title,
            "Url": self.url,
            "Tags": self.tags,
            "Image": self.image,
            "Video": self.video,
            "Category": self.category,
            "SourceUrl": self.source_url,
        }


@dataclass
class ScraperConfig:
    """Configuration for the scraper."""
    headless: bool = True
    max_pages: Optional[int] = None
    output_dir: str = OUTPUT_DIR
    dry_run: bool = False


class GracefulExit(Exception):
    """Custom exception for graceful exit."""
    pass


# Global state for signal handling
_browser: Optional[Browser] = None
_playwright: Optional[Playwright] = None


def handle_interrupt(signum: int, frame: Any) -> None:
    """Handle interrupt signals for graceful shutdown."""
    global _browser, _playwright
    logger.info("Interrupt received. Shutting down gracefully...")
    if _browser:
        try:
            _browser.close()
        except Exception as e:
            logger.error(f"Error closing browser: {e}")
    if _playwright:
        try:
            _playwright.stop()
        except Exception as e:
            logger.error(f"Error stopping playwright: {e}")
    sys.exit(1)


def validate_url(url: str, base: str = BASE_URL) -> str:
    """
    Validate and normalize a URL.
    
    Args:
        url: The URL to validate
        base: The base URL to use for relative paths
        
    Returns:
        Normalized absolute URL
    """
    if not url:
        return ""
    
    url = url.strip()
    
    # Handle relative URLs
    if url.startswith("/"):
        url = urljoin(base, url)
    
    # Handle protocol-relative URLs
    if url.startswith("//"):
        url = f"https:{url}"
    
    # Parse and validate
    parsed = urlparse(url)
    if not parsed.scheme:
        url = urljoin(base, url)
        parsed = urlparse(url)
    
    # Ensure HTTPS
    if parsed.scheme == "http":
        url = url.replace("http://", "https://", 1)
    
    return url


def validate_image_url(url: str) -> str:
    """
    Validate an image URL and return empty string if invalid.
    
    Args:
        url: The image URL to validate
        
    Returns:
        Validated image URL or empty string
    """
    if not url:
        return ""
    
    url = url.strip()
    
    # Skip placeholder or tracking URLs
    skip_patterns = [
        "data:",
        "javascript:",
        "about:blank",
        "tracking",
        "placeholder",
        "blank.gif",
        "transparent.png",
    ]
    
    url_lower = url.lower()
    if any(pattern in url_lower for pattern in skip_patterns):
        return ""
    
    # Validate URL structure
    parsed = urlparse(url)
    if not parsed.scheme and not url.startswith("/"):
        return ""
    
    return url


def select_category() -> str:
    """
    Displays a menu for the user to pick a category by number.
    
    Returns:
        Selected category string
    """
    print("\n" + "=" * 50)
    print("Y8.com Grid Scraper - Category Selection")
    print("=" * 50)
    for idx, category in enumerate(CATEGORIES, start=1):
        print(f"  [{idx:2d}] {category}")
    print("=" * 50)

    while True:
        try:
            choice = input("\nEnter the corresponding number (1-{}): ".format(len(CATEGORIES)))
            choice = choice.strip()
            if not choice:
                continue
            choice_num = int(choice)
            if 1 <= choice_num <= len(CATEGORIES):
                selected = CATEGORIES[choice_num - 1]
                logger.info(f"Selected category: {selected}")
                return selected
            else:
                print(f"  Please enter a number between 1 and {len(CATEGORIES)}.")
        except ValueError:
            print("  Invalid input. Please enter a valid number.")
        except KeyboardInterrupt:
            print("\n  Operation cancelled.")
            raise GracefulExit()


def get_random_user_agent() -> str:
    """Get a random user agent from the list."""
    return random.choice(USER_AGENTS)


def create_output_dir(output_dir: str) -> str:
    """
    Create output directory if it doesn't exist.
    
    Args:
        output_dir: Path to the output directory
        
    Returns:
        Absolute path to the output directory
    """
    os.makedirs(output_dir, exist_ok=True)
    return os.path.abspath(output_dir)


def get_page(
    playwright: Playwright,
    user_agent: Optional[str] = None,
    headless: bool = True,
) -> tuple[Browser, BrowserContext, Page]:
    """
    Create and configure a browser page.
    
    Args:
        playwright: Playwright instance
        user_agent: User agent string (random if None)
        headless: Whether to run in headless mode
        
    Returns:
        Tuple of (browser, context, page)
    """
    if user_agent is None:
        user_agent = get_random_user_agent()
    
    browser = playwright.chromium.launch(headless=headless)
    context = browser.new_context(
        user_agent=user_agent,
        viewport={"width": 1920, "height": 1080},
    )
    page = context.new_page()
    page.set_default_timeout(DEFAULT_TIMEOUT_MS)
    
    return browser, context, page


def scrape_page(
    page: Page,
    category: str,
    page_number: int,
    base_url: str = BASE_URL,
) -> List[Dict[str, str]]:
    """
    Scrape a single page of the grid.
    
    Args:
        page: Playwright page object
        category: The category to scrape
        page_number: The page number to scrape
        base_url: The base URL for the site
        
    Returns:
        List of scraped item dictionaries
    """
    target_url = f"{base_url}/{category}?page={page_number}"
    logger.info(f"Scraping page {page_number}: {target_url}")
    
    try:
        # Navigate to the page
        response = page.goto(
            target_url,
            wait_until="domcontentloaded",
            timeout=PAGE_LOAD_TIMEOUT_MS,
        )
        
        # Check for HTTP errors
        if response and response.status != 200:
            logger.error(f"HTTP {response.status} for {target_url}")
            return []
        
        # Wait for the container to be present
        try:
            page.wait_for_selector("#items_container", timeout=15000)
        except Exception as e:
            logger.warning(f"Container not found on page {page_number}: {e}")
            return []
        
        # Scroll to trigger lazy loading
        for _ in range(3):
            page.evaluate("window.scrollBy(0, 800);")
            time.sleep(0.3)
        
        time.sleep(1.0)
        
        # Execute JavaScript to extract data
        scraped_data = page.evaluate("""
            () => {
                const container = document.querySelector("#items_container");
                if (!container) return null;
                
                const listItems = container.querySelectorAll("li");
                const dataArray = [];
                
                listItems.forEach(item => {
                    const tags = item.getAttribute("data-label-ids") || "";
                    const video = item.getAttribute("data-mp4-movie") || "";
                    
                    const anchor = item.querySelector("a");
                    const title = anchor ? (anchor.getAttribute("aria-label") || 
                                          anchor.getAttribute("title") || 
                                          anchor.textContent?.trim() || "") : "";
                    
                    let url = anchor ? (anchor.getAttribute("href") || "") : "";
                    
                    const img = item.querySelector("img");
                    let image = "";
                    if (img) {
                        image = img.getAttribute("data-src") || 
                               img.getAttribute("src") || 
                               img.getAttribute("data-original") || "";
                    }
                    
                    dataArray.push({
                        title: title.trim(),
                        url: url.trim(),
                        tags: tags.trim(),
                        image: image.trim(),
                        video: video.trim()
                    });
                });
                
                return dataArray;
            }
        """)
        
        if scraped_data is None:
            logger.warning(f"No data returned from JavaScript on page {page_number}")
            return []
        
        if not scraped_data:
            logger.info(f"No items found on page {page_number}")
            return []
        
        logger.info(f"Found {len(scraped_data)} items on page {page_number}")
        return scraped_data
        
    except Exception as e:
        logger.error(f"Error scraping page {page_number}: {e}")
        return []


def process_scraped_data(
    raw_data: List[Dict[str, str]],
    category: str,
    source_url: str,
    base_url: str = BASE_URL,
) -> List[ScrapedItem]:
    """
    Process raw scraped data into validated ScrapedItem objects.
    
    Args:
        raw_data: Raw data from JavaScript extraction
        category: The category being scraped
        source_url: The source page URL
        base_url: The base URL for normalization
        
    Returns:
        List of validated ScrapedItem objects
    """
    items = []
    seen_urls = set()
    
    for raw_item in raw_data:
        try:
            # Validate and normalize URL
            url = validate_url(raw_item.get("url", ""), base_url)
            
            # Skip duplicates
            if url in seen_urls:
                logger.debug(f"Skipping duplicate URL: {url}")
                continue
            seen_urls.add(url)
            
            # Validate image URL
            image = validate_image_url(raw_item.get("image", ""))
            
            # Create validated item
            item = ScrapedItem(
                title=raw_item.get("title", ""),
                url=url,
                tags=raw_item.get("tags", ""),
                image=image,
                video=raw_item.get("video", ""),
                category=category,
                source_url=source_url,
            )
            items.append(item)
            
        except Exception as e:
            logger.warning(f"Error processing item: {e}")
            continue
    
    return items


def save_results(
    items: List[ScrapedItem],
    category: str,
    output_dir: str,
    dry_run: bool = False,
) -> str:
    """
    Save scraped items to a JSON file.
    
    Args:
        items: List of scraped items
        category: The category name
        output_dir: Output directory
        dry_run: If True, don't actually write files
        
    Returns:
        Path to the saved file
    """
    output_dir = create_output_dir(output_dir)
    output_filename = f"{category}_games.json"
    output_path = os.path.join(output_dir, output_filename)
    
    if not items:
        logger.warning("No items to save")
        return output_path
    
    # Convert to list of dicts
    data = [item.to_dict() for item in items]
    
    if dry_run:
        logger.info(f"[DRY RUN] Would save {len(data)} items to {output_path}")
        return output_path
    
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        logger.info(f"Saved {len(data)} items to {output_path}")
        return output_path
    except Exception as e:
        logger.error(f"Error saving results: {e}")
        raise


def scrape_category(
    category: str,
    config: ScraperConfig,
) -> List[ScrapedItem]:
    """
    Scrape all pages for a given category.
    
    Args:
        category: The category to scrape
        config: Scraper configuration
        
    Returns:
        List of all scraped items
    """
    global _browser, _playwright
    
    all_items: List[ScrapedItem] = []
    page_number = 1
    consecutive_failures = 0
    max_consecutive_failures = 3
    
    logger.info(f"Starting scrape for category: {category}")
    
    # Set up signal handling
    signal.signal(signal.SIGINT, handle_interrupt)
    signal.signal(signal.SIGTERM, handle_interrupt)
    
    try:
        with sync_playwright() as p:
            _playwright = p
            
            while True:
                # Check max pages limit
                if config.max_pages and page_number > config.max_pages:
                    logger.info(f"Reached max pages limit: {config.max_pages}")
                    break
                
                # Check consecutive failures
                if consecutive_failures >= max_consecutive_failures:
                    logger.error("Too many consecutive failures. Stopping.")
                    break
                
                # Create new browser context for each page to avoid state issues
                user_agent = get_random_user_agent()
                
                try:
                    browser, context, page = get_page(
                        p,
                        user_agent=user_agent,
                        headless=config.headless,
                    )
                    _browser = browser
                    
                    # Scrape the page
                    raw_data = scrape_page(
                        page,
                        category,
                        page_number,
                        BASE_URL,
                    )
                    
                    if not raw_data:
                        consecutive_failures += 1
                        logger.warning(f"No data from page {page_number}, failure count: {consecutive_failures}")
                        
                        # Try alternate base URL
                        if page_number == 1:
                            logger.info("Trying alternate base URL...")
                            raw_data = scrape_page(
                                page,
                                category,
                                page_number,
                                ALTERNATE_BASE_URL,
                            )
                        
                        if not raw_data:
                            # Clean up and continue to next page
                            context.close()
                            browser.close()
                            page_number += 1
                            continue
                    
                    consecutive_failures = 0
                    
                    # Process and validate data
                    source_url = f"{BASE_URL}/{category}?page={page_number}"
                    items = process_scraped_data(
                        raw_data,
                        category,
                        source_url,
                        BASE_URL,
                    )
                    
                    if items:
                        all_items.extend(items)
                        logger.info(f"Total items so far: {len(all_items)}")
                    
                    # Check if we've reached the last page
                    if len(raw_data) < ITEMS_PER_PAGE_THRESHOLD:
                        logger.info(f"Page {page_number} has {len(raw_data)} items (< {ITEMS_PER_PAGE_THRESHOLD}). Last page reached.")
                        break
                    
                    page_number += 1
                    
                    # Random delay between requests
                    delay = random.uniform(REQUEST_DELAY_MIN, REQUEST_DELAY_MAX)
                    logger.debug(f"Waiting {delay:.2f}s before next request...")
                    time.sleep(delay)
                    
                except Exception as e:
                    consecutive_failures += 1
                    logger.error(f"Error on page {page_number}: {e}")
                    # Continue to next page
                finally:
                    # Clean up page and context
                    try:
                        if 'context' in locals():
                            context.close()
                        if 'browser' in locals():
                            browser.close()
                    except Exception as e:
                        logger.error(f"Error closing browser resources: {e}")
            
            _playwright = None
        
    except GracefulExit:
        logger.info("Scraping interrupted by user")
        raise
    except Exception as e:
        logger.error(f"Fatal error during scraping: {e}")
        raise
    finally:
        _browser = None
    
    return all_items


def main() -> None:
    """Main entry point for the scraper."""
    try:
        # Parse command line arguments (simple version)
        dry_run = "--dry-run" in sys.argv
        headless = "--no-headless" not in sys.argv
        
        config = ScraperConfig(
            headless=headless,
            dry_run=dry_run,
        )
        
        if dry_run:
            logger.info("Running in dry-run mode (no files will be written)")
        if not headless:
            logger.info("Running with browser visible")
        
        # Check for Playwright installation and system dependencies
        try:
            import playwright
        except ImportError:
            logger.error("Playwright is not installed. Please install with: pip install playwright && playwright install")
            sys.exit(1)
        
        # Check if system has required libraries for Playwright
        import subprocess
        try:
            # Test if we can launch a browser
            with sync_playwright() as test_p:
                test_browser = test_p.chromium.launch(headless=True)
                test_browser.close()
        except Exception as e:
            error_msg = str(e)
            if "cannot open shared object file" in error_msg or "libglib" in error_msg:
                logger.error(
                    "System is missing required libraries for Playwright. "
                    "On Debian/Ubuntu, install with: apt-get install -y libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2"
                )
                sys.exit(1)
            # Re-raise other errors
            raise
        
        # Select category
        category = select_category()
        
        # Scrape the category
        items = scrape_category(category, config)
        
        # Save results
        if items:
            output_path = save_results(
                items,
                category,
                config.output_dir,
                dry_run=dry_run,
            )
            logger.info(f"Scraping complete! Results saved to: {output_path}")
            print(f"\n✅ Successfully scraped {len(items)} games from category '{category}'")
            print(f"   Output: {output_path}")
        else:
            logger.warning("No items were scraped")
            print("\n⚠️  No games were found. Check the logs for errors.")
        
    except GracefulExit:
        print("\n👋 Scraping cancelled by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        print(f"\n❌ An error occurred: {e}")
        print("   Check grid_scraper.log for details")
        sys.exit(1)


if __name__ == "__main__":
    main()
