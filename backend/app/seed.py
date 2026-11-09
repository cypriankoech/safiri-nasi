"""Seed the database with Safiri Nasi's starter catalogue and demo records.

    uv run python -m app.seed            # seed an empty database
    uv run python -m app.seed --reset    # wipe all data first (development only!)
    uv run python -m app.seed --no-demo  # catalogue only, no sample bookings/payments

Photos are freely licensed images from Wikimedia Commons; credits are listed in
seed_images.json and shown on the site's /credits page.
"""

import argparse
import asyncio
import json
import random
import secrets
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from slugify import slugify
from sqlalchemy import select, text

from app.config import settings
from app.db import Base, SessionLocal, engine
from app.models import (
    AddOn,
    BlogPost,
    Booking,
    Category,
    Departure,
    Destination,
    Faq,
    ItineraryDay,
    Payment,
    PromoCode,
    Review,
    Tour,
    TourPrice,
    Traveller,
    User,
)
from app.models.enums import BookingStatus, PaymentStatus, PublishStatus, Role
from app.security import hash_password
from app.services.booking import new_reference
from app.services.pricing import money

IMAGES = json.loads((Path(__file__).parent / "seed_images.json").read_text())


# Safiri Nasi's own trip photos, served by the website from /media/photos.
OWN_PHOTOS = {
    "own_lions_vehicle": "lions-walking-by-safari-landcruiser",
    "own_hippos": "hippos-on-riverbank",
    "own_lion": "male-lion-in-tall-grass",
    "own_lionesses": "lionesses-in-grassland",
    "own_cheetah": "cheetah-with-gazelles",
    "own_dunes": "travellers-on-sand-dunes",
    "own_elephants": "elephant-family-on-plains",
    "own_rhino": "white-rhino-grazing",
    "own_buffalo": "cape-buffalo-on-plains",
}


def img(key: str) -> str:
    if key in OWN_PHOTOS:
        return f"/media/photos/{OWN_PHOTOS[key]}.webp"
    return IMAGES[key]["thumb"]


def D(value) -> Decimal:
    return Decimal(str(value))


CATEGORIES = [
    (
        "Safari",
        "safari",
        "Game drives across Kenya's legendary parks and reserves.",
        "binoculars",
        "own_lion",
    ),
    ("Beach & Coast", "beach", "White sand, warm Indian Ocean water and Swahili culture.", "palm", "diani"),
    ("Staycations", "staycations", "Easy weekend escapes close to Nairobi.", "tent", "naivasha"),
    ("Day Trips", "day-trips", "Make the most of a single day out of the city.", "sun", "giraffe_centre"),
    (
        "Adventure & Hiking",
        "adventure",
        "Summits, gorges and trails for the active traveller.",
        "mountain",
        "mtkenya",
    ),
    ("International", "international", "Hand-picked holidays beyond Kenya's borders.", "plane", "dubai"),
    ("Honeymoon", "honeymoon", "Romantic escapes for two.", "heart", "zanzibar"),
    ("Family", "family", "Trips that work for every age.", "users", "nairobi_np"),
    ("Culture & Heritage", "culture", "Old towns, local food and living traditions.", "landmark", "lamu"),
]

DESTINATIONS = [
    dict(
        name="Maasai Mara",
        region="kenya",
        country="Kenya",
        gallery=["own_lion", "own_cheetah", "own_hippos", "own_buffalo", "own_lionesses", "own_elephants"],
        image="mara_balloon",
        lat=-1.4061,
        lng=35.0081,
        featured=True,
        best_time="July – October for the Great Migration; great game all year.",
        summary="Kenya's most famous reserve: big cats, endless plains and the Great Migration.",
        highlights=[
            "Great Migration river crossings",
            "Big Five game drives",
            "Sunrise hot-air balloon safaris",
            "Maasai village visits",
        ],
        description="The Maasai Mara National Reserve rolls across south-western Kenya into Tanzania's Serengeti. "
        "It is home to some of the densest populations of lion, leopard and cheetah in Africa, and every year from "
        "July to October more than a million wildebeest and zebra cross the Mara River in the Great Migration.",
    ),
    dict(
        name="Amboseli",
        region="kenya",
        country="Kenya",
        gallery=["amboseli_elephants", "own_elephants"],
        image="amboseli",
        lat=-2.6527,
        lng=37.2606,
        featured=True,
        best_time="June – October and January – February (dry seasons).",
        summary="Big-tusked elephants with Mount Kilimanjaro as your backdrop.",
        highlights=["Elephant herds below Kilimanjaro", "Observation Hill views", "Swamps full of birdlife"],
        description="Amboseli National Park sits at the foot of Kilimanjaro, Africa's highest mountain. Its swamps, "
        "fed by the mountain's snowmelt, draw huge elephant herds and make this one of the most photogenic parks "
        "on the continent.",
    ),
    dict(
        name="Tsavo",
        region="kenya",
        country="Kenya",
        image="tsavo",
        lat=-2.9833,
        lng=38.4667,
        best_time="June – October.",
        summary="Wild, vast and red: Kenya's largest national park.",
        highlights=["Red-dusted elephants", "Mzima Springs", "Lugard Falls", "Shetani lava flows"],
        description="Tsavo East and Tsavo West together make up one of the largest protected areas in the world. "
        "Expect wide open landscapes, volcanic hills and the famous elephants that are coloured red by the soil.",
    ),
    dict(
        name="Diani Beach",
        region="kenya",
        country="Kenya",
        image="diani",
        lat=-4.3167,
        lng=39.5667,
        featured=True,
        best_time="December – March and July – October.",
        summary="Award-winning white sand south of Mombasa.",
        highlights=["Snorkelling and dhow trips to Wasini & Kisite", "Colobus monkeys", "Kitesurfing"],
        description="Diani's long, palm-fringed beach is regularly voted one of Africa's best. Pair lazy beach days "
        "with dolphin spotting at Kisite Marine Park or a Swahili seafood lunch on Wasini Island.",
    ),
    dict(
        name="Watamu & Malindi",
        region="kenya",
        country="Kenya",
        image="watamu",
        lat=-3.354,
        lng=40.019,
        best_time="December – April.",
        summary="Turquoise lagoons, marine parks and Italian-Swahili flair.",
        highlights=["Watamu Marine National Park", "Gede Ruins", "Mida Creek sunset"],
        description="North of Mombasa, Watamu and Malindi offer calm lagoons, coral gardens and laid-back seafront "
        "towns, plus easy access to the Gede Ruins and Arabuko Sokoke Forest.",
    ),
    dict(
        name="Lake Naivasha",
        region="kenya",
        country="Kenya",
        image="naivasha",
        lat=-0.7667,
        lng=36.4333,
        featured=True,
        best_time="All year.",
        summary="Hippos, boat rides and Hell's Gate, 90 minutes from Nairobi.",
        highlights=[
            "Boat ride among hippos",
            "Crescent Island walking safari",
            "Cycling through Hell's Gate",
        ],
        description="A freshwater lake in the Great Rift Valley, Naivasha is Nairobi's favourite weekend escape. "
        "Combine a boat ride with a cycle through Hell's Gate's gorges.",
    ),
    dict(
        name="Lake Nakuru",
        region="kenya",
        country="Kenya",
        gallery=["own_rhino", "nakuru_rhino", "flamingo"],
        image="nakuru",
        lat=-0.3667,
        lng=36.0833,
        best_time="All year.",
        summary="Flamingo shores and one of Kenya's best rhino sanctuaries.",
        highlights=["Black and white rhino", "Flamingos", "Baboon Cliff viewpoint"],
        description="Lake Nakuru National Park protects both black and white rhino and is famous for the pink "
        "fringe of flamingos along its alkaline shores.",
    ),
    dict(
        name="Samburu",
        region="kenya",
        country="Kenya",
        image="samburu",
        lat=0.6167,
        lng=37.5333,
        best_time="June – October and December – March.",
        summary="Northern Kenya's 'Special Five' and Ewaso Nyiro river.",
        highlights=["Reticulated giraffe & Grevy's zebra", "Ewaso Nyiro river", "Samburu culture"],
        description="Arid and beautiful, Samburu is home to species found only in Kenya's north: reticulated giraffe, "
        "Grevy's zebra, Beisa oryx, Somali ostrich and gerenuk.",
    ),
    dict(
        name="Mount Kenya",
        region="kenya",
        country="Kenya",
        image="mtkenya",
        lat=-0.1521,
        lng=37.3084,
        best_time="January – February and August – September.",
        summary="Africa's second-highest mountain.",
        highlights=["Point Lenana (4,985 m) summit", "Lake Michaelson", "Vertical bog and giant lobelias"],
        description="Mount Kenya's jagged peaks rise above glacial tarns and Afro-alpine moorland. Trekkers summit "
        "Point Lenana; climbers tackle Batian and Nelion.",
    ),
    dict(
        name="Nairobi",
        region="kenya",
        country="Kenya",
        gallery=["own_lions_vehicle", "own_rhino", "giraffe_centre"],
        image="nairobi_np",
        lat=-1.2921,
        lng=36.8219,
        best_time="All year.",
        summary="The world's only capital city with a national park.",
        highlights=["Nairobi National Park", "Giraffe Centre", "Sheldrick elephant orphanage"],
        description="Start or end your trip with wildlife on the city's doorstep: lions and rhino against a skyline "
        "of skyscrapers, and close encounters with Rothschild's giraffes.",
    ),
    dict(
        name="Lamu",
        region="kenya",
        country="Kenya",
        image="lamu",
        lat=-2.2717,
        lng=40.902,
        best_time="October – April.",
        summary="A UNESCO-listed Swahili town where donkeys outnumber cars.",
        highlights=["Lamu Old Town", "Dhow sunset cruises", "Shela beach"],
        description="Lamu Old Town is the oldest continually inhabited Swahili settlement in East Africa. Narrow "
        "lanes, carved doors and dhows under sail make it feel timeless.",
    ),
    dict(
        name="Zanzibar",
        region="africa",
        country="Tanzania",
        image="zanzibar",
        lat=-6.1659,
        lng=39.2026,
        featured=True,
        best_time="June – October and December – February.",
        summary="Spice island beaches and Stone Town.",
        highlights=["Nungwi & Kendwa beaches", "Stone Town walking tour", "Spice farm visit"],
        description="Just over an hour's flight from Nairobi, Zanzibar mixes powder-white beaches with the winding "
        "alleys of Stone Town.",
    ),
    dict(
        name="Rwanda",
        region="africa",
        country="Rwanda",
        image="gorilla",
        lat=-1.43,
        lng=29.59,
        best_time="June – September and December – February.",
        summary="Face-to-face with mountain gorillas.",
        highlights=["Gorilla trekking in Volcanoes NP", "Golden monkeys", "Kigali Genocide Memorial"],
        description="Trek through bamboo forest on the Virunga volcanoes to spend an unforgettable hour with a "
        "habituated mountain gorilla family.",
    ),
    dict(
        name="Serengeti",
        region="africa",
        country="Tanzania",
        image="serengeti",
        lat=-2.3333,
        lng=34.8333,
        best_time="All year; calving season January – March.",
        summary="Endless plains and big cats.",
        highlights=["Great Migration", "Kopjes and lions", "Hot-air balloons"],
        description="The Serengeti is the other half of the Mara ecosystem. Tell us your dates and we'll tailor a "
        "Tanzania safari.",
    ),
    dict(
        name="Dubai",
        region="international",
        country="United Arab Emirates",
        image="dubai",
        lat=25.2048,
        lng=55.2708,
        featured=True,
        best_time="November – March.",
        summary="Skyscrapers, shopping and desert dunes.",
        highlights=["Burj Khalifa", "Desert safari", "Dubai Mall & souks"],
        description="Only five hours from Nairobi, Dubai is ideal for shopping, family fun and a taste of the desert.",
    ),
    dict(
        name="Cape Town",
        region="africa",
        country="South Africa",
        image="cape_town",
        lat=-33.9249,
        lng=18.4241,
        best_time="November – March.",
        summary="Table Mountain, winelands and the Cape Peninsula.",
        highlights=["Table Mountain", "Cape Point", "Stellenbosch wine tasting"],
        description="Cape Town pairs a mountain in the middle of the city with beaches, penguins and wine country.",
    ),
]


def tour_defs():
    std_cancel = (
        "Deposits are non-refundable within 30 days of travel. Cancellations 31–60 days before travel: 50% of the "
        "deposit is refunded. More than 60 days: full refund less KES 2,500 admin fee. Date changes are free up to "
        "21 days before travel, subject to availability."
    )
    return [
        dict(
            title="3-Day Maasai Mara Budget Safari",
            destination="maasai-mara",
            categories=["safari", "family"],
            tour_type="scheduled",
            days=3,
            nights=2,
            difficulty="easy",
            min_group=1,
            max_group=7,
            start="Nairobi CBD",
            end="Nairobi CBD",
            transport="4x4 Land Cruiser with pop-up roof",
            accommodation_level="Budget",
            hero="mara_balloon",
            gallery=["own_lion", "own_cheetah", "own_buffalo", "own_lionesses", "mara"],
            featured=True,
            deposit=30,
            balance_days=14,
            summary="Our best-selling shared safari: two nights in a comfortable tented camp and full-day game drives "
            "in the Mara.",
            description="Leave Nairobi in the morning, wind down the Great Rift Valley escarpment and arrive in the "
            "Maasai Mara for lunch. You'll have an afternoon game drive, a full day exploring the reserve with a "
            "picnic lunch, and a final morning drive before heading back. Shared 4x4 Land Cruisers mean everyone gets "
            "a window seat.",
            highlights=[
                "Full-day game drive with picnic lunch",
                "Rift Valley viewpoint stop",
                "Optional Maasai village visit",
                "Pop-up roof 4x4 Land Cruiser",
            ],
            inclusions=[
                "Park entry fees",
                "2 nights in a tented camp",
                "All meals on safari",
                "Game drives with a professional driver-guide",
                "Drinking water in the vehicle",
                "Pick-up from Nairobi hotels",
            ],
            exclusions=[
                "Tips and gratuities",
                "Drinks at camp",
                "Maasai village visit (USD 20 pp)",
                "Hot-air balloon safari",
            ],
            prices={"resident": ("KES", 32500, 22000, 6000), "non_resident": ("USD", 520, 360, 60)},
            itinerary=[
                (
                    "Nairobi to Maasai Mara",
                    "Morning pick-up and drive via the Rift Valley viewpoint. Check in, "
                    "lunch, then an afternoon game drive until sunset.",
                    "Mara tented camp",
                    "L, D",
                    "Maasai Mara",
                ),
                (
                    "Full day in the Mara",
                    "Spend the whole day following the action, with a picnic lunch by the Mara "
                    "River. Look for lions, cheetahs and the Big Five.",
                    "Mara tented camp",
                    "B, L, D",
                    "Maasai Mara",
                ),
                (
                    "Morning drive & return",
                    "Early game drive at the best time for predators, breakfast, then return "
                    "to Nairobi by late afternoon.",
                    None,
                    "B, L",
                    "Nairobi",
                ),
            ],
            map=[
                ("Nairobi", -1.2921, 36.8219, 1),
                ("Rift Valley viewpoint", -1.0, 36.6, 1),
                ("Maasai Mara", -1.4061, 35.0081, 2),
            ],
            add_ons=[
                ("Hot-air balloon safari", "Sunrise flight with champagne breakfast", 62000, 480, True),
                ("Maasai village visit", "Guided visit to a local manyatta", 2600, 20, True),
            ],
            departures=("weekly", 4, 7),
            faqs=[
                (
                    "Is this a shared safari?",
                    "Yes. You'll share the vehicle with up to 6 other travellers. Book "
                    "our private safari for a vehicle to yourself.",
                ),
                (
                    "Can you pick me up from the airport?",
                    "Yes, airport pick-ups can be added for a small fee.",
                ),
            ],
            cancellation=std_cancel,
        ),
        dict(
            title="5-Day Great Migration Safari",
            destination="maasai-mara",
            categories=["safari"],
            tour_type="scheduled",
            days=5,
            nights=4,
            difficulty="easy",
            min_group=2,
            max_group=6,
            start="Nairobi",
            end="Nairobi",
            transport="4x4 Land Cruiser",
            accommodation_level="Mid-range",
            hero="migration",
            gallery=["own_hippos", "own_elephants", "own_cheetah", "mara_balloon"],
            featured=True,
            deposit=40,
            balance_days=45,
            summary="Four nights in the Mara at the peak of the migration, timed for river crossings.",
            description="From July to October, the Mara hosts one of the planet's greatest wildlife spectacles. Our "
            "guides know the crossing points and stay in radio contact all day so you're there when the herds plunge "
            "into the river. You stay in a well-placed mid-range tented camp close to the river.",
            highlights=[
                "Mara River crossing points",
                "Full-day drives with experienced migration guides",
                "Stay inside the migration corridor",
            ],
            inclusions=["Park fees", "4 nights full board", "Unlimited game drives", "Nairobi transfers"],
            exclusions=["Flights", "Tips", "Balloon safari"],
            prices={"resident": ("KES", 89000, 62000, 14000), "non_resident": ("USD", 1450, 990, 220)},
            itinerary=[
                (
                    "Into the Mara",
                    "Drive from Nairobi, arriving for lunch and an evening game drive.",
                    "Mara River Camp",
                    "L, D",
                    "Maasai Mara",
                ),
                (
                    "Following the herds",
                    "Full day with the migration, picnic lunch on the plains.",
                    "Mara River Camp",
                    "B, L, D",
                    "Maasai Mara",
                ),
                (
                    "River crossing day",
                    "We position early at the river and wait for the crossing.",
                    "Mara River Camp",
                    "B, L, D",
                    "Mara River",
                ),
                (
                    "Predators of the Mara",
                    "Lions, cheetahs and leopards shadow the herds.",
                    "Mara River Camp",
                    "B, L, D",
                    "Maasai Mara",
                ),
                ("Return to Nairobi", "Morning drive then return to Nairobi.", None, "B, L", "Nairobi"),
            ],
            map=[("Nairobi", -1.2921, 36.8219, 1), ("Mara River", -1.52, 35.03, 3)],
            add_ons=[("Hot-air balloon safari", "Sunrise flight with bush breakfast", 62000, 480, True)],
            departures=("migration", 6, 0),
            cancellation=std_cancel,
        ),
        dict(
            title="4-Day Amboseli & Tsavo West Safari",
            destination="amboseli",
            categories=["safari", "family"],
            tour_type="scheduled",
            days=4,
            nights=3,
            difficulty="easy",
            min_group=1,
            max_group=7,
            start="Nairobi",
            end="Nairobi",
            transport="4x4 Land Cruiser",
            accommodation_level="Mid-range",
            hero="amboseli",
            gallery=["amboseli_elephants", "own_elephants", "tsavo"],
            featured=True,
            summary="Elephants beneath Kilimanjaro, then Tsavo's springs and lava flows.",
            description="Two very different parks in one trip. Amboseli gives you the classic shot of elephants "
            "with snow-capped Kilimanjaro behind, while Tsavo West adds volcanic landscapes, Mzima Springs and "
            "rhino country.",
            highlights=["Kilimanjaro views", "Mzima Springs underwater hide", "Shetani lava flow"],
            inclusions=["Park fees", "3 nights full board in lodges", "Game drives", "Nairobi transfers"],
            exclusions=["Tips", "Drinks"],
            prices={"resident": ("KES", 58000, 39000, 9000), "non_resident": ("USD", 890, 610, 120)},
            itinerary=[
                (
                    "Nairobi to Amboseli",
                    "Drive south to Amboseli for an afternoon game drive.",
                    "Amboseli lodge",
                    "L, D",
                    "Amboseli",
                ),
                (
                    "Amboseli full day",
                    "Sunrise views of Kilimanjaro and the elephant herds.",
                    "Amboseli lodge",
                    "B, L, D",
                    "Amboseli",
                ),
                (
                    "To Tsavo West",
                    "Cross to Tsavo West via the Chyulu Hills, visit Mzima Springs.",
                    "Tsavo lodge",
                    "B, L, D",
                    "Tsavo West",
                ),
                ("Return to Nairobi", "Morning drive and return to Nairobi.", None, "B, L", "Nairobi"),
            ],
            map=[
                ("Nairobi", -1.2921, 36.8219, 1),
                ("Amboseli", -2.6527, 37.2606, 1),
                ("Tsavo West", -3.0, 38.05, 3),
            ],
            add_ons=[],
            departures=("weekly", 2, 10),
            cancellation=std_cancel,
        ),
        dict(
            title="2-Day Lake Naivasha & Nakuru Getaway",
            destination="lake-naivasha",
            categories=["staycations", "family", "safari"],
            tour_type="scheduled",
            days=2,
            nights=1,
            difficulty="easy",
            min_group=1,
            max_group=12,
            start="Nairobi",
            end="Nairobi",
            transport="Safari minivan",
            accommodation_level="Mid-range",
            hero="naivasha",
            gallery=["nakuru", "own_rhino", "hellsgate"],
            deal_label="Weekend favourite",
            summary="A weekend of hippos, flamingos and rhinos in the Rift Valley.",
            description="Saturday morning on Lake Naivasha in a boat among hippos and fish eagles, then on to Lake "
            "Nakuru National Park to look for rhino and flamingos. Back in Nairobi by Sunday evening.",
            highlights=["Boat ride on Lake Naivasha", "Rhino tracking in Nakuru", "Baboon Cliff viewpoint"],
            inclusions=["Boat ride", "Park fees", "1 night half board", "Transport"],
            exclusions=["Lunch on day 1", "Tips"],
            prices={"resident": ("KES", 24500, 16500, 4500), "non_resident": ("USD", 360, 250, 60)},
            itinerary=[
                (
                    "Naivasha boat ride",
                    "Leave Nairobi at 7am for Naivasha, boat ride and walk on Crescent Island.",
                    "Lakeside resort",
                    "D",
                    "Lake Naivasha",
                ),
                (
                    "Lake Nakuru National Park",
                    "Game drive in Nakuru for rhino, lions and flamingos, return to Nairobi.",
                    None,
                    "B, L",
                    "Lake Nakuru",
                ),
            ],
            map=[
                ("Nairobi", -1.2921, 36.8219, 1),
                ("Lake Naivasha", -0.7667, 36.4333, 1),
                ("Lake Nakuru", -0.3667, 36.0833, 2),
            ],
            add_ons=[("Crescent Island walking safari", "Walk among giraffe and zebra", 3500, 35, True)],
            departures=("weekly", 5, 6),
        ),
        dict(
            title="Diani Beach Holiday – 4 Nights by SGR",
            destination="diani-beach",
            categories=["beach", "honeymoon", "family"],
            tour_type="private",
            days=5,
            nights=4,
            difficulty="easy",
            min_group=1,
            max_group=10,
            start="Nairobi Terminus (SGR)",
            end="Nairobi Terminus (SGR)",
            transport="Madaraka Express (SGR) + private transfer",
            accommodation_level="Mid-range",
            hero="diani",
            gallery=["diani2", "camels", "sgr"],
            featured=True,
            is_deal=True,
            deal_label="Save KES 5,500",
            deposit=30,
            balance_days=14,
            summary="Take the SGR to the coast and unwind for four nights at a beachfront resort on Diani's "
            "white sands.",
            description="Ride the Madaraka Express from Nairobi to Mombasa, transfer to Diani and spend four nights "
            "at a beachfront resort on half board. Choose your own dates and we take care of tickets, transfers and "
            "the hotel.",
            highlights=[
                "Return SGR economy tickets",
                "Beachfront resort, half board",
                "Free day for Wasini dhow trip",
            ],
            inclusions=["Return SGR economy tickets", "Mombasa station transfers", "4 nights half board"],
            exclusions=["Lunches", "Excursions", "Tips"],
            prices={
                "resident": ("KES", 46500, 23500, 18000, 52000),
                "non_resident": ("USD", 520, 260, 200, 580),
            },
            itinerary=[
                (
                    "SGR to the coast",
                    "Morning Madaraka Express to Mombasa, transfer to Diani.",
                    "Diani beach resort",
                    "D",
                    "Diani",
                ),
                ("Beach day", "Relax by the ocean.", "Diani beach resort", "B, D", "Diani"),
                (
                    "Optional Wasini dhow trip",
                    "Snorkel in Kisite Marine Park, Swahili seafood lunch on Wasini.",
                    "Diani beach resort",
                    "B, D",
                    "Wasini Island",
                ),
                ("Free day", "Kitesurfing, spa or colobus walk.", "Diani beach resort", "B, D", "Diani"),
                ("Back to Nairobi", "Transfer to Mombasa Terminus for the SGR home.", None, "B", "Nairobi"),
            ],
            map=[
                ("Nairobi", -1.2921, 36.8219, 1),
                ("Mombasa", -4.0435, 39.6682, 1),
                ("Diani Beach", -4.3167, 39.5667, 1),
                ("Wasini Island", -4.66, 39.37, 3),
            ],
            add_ons=[
                ("SGR first class upgrade", "Return first class seats", 3000, 25, True),
                ("Wasini dhow & snorkelling trip", "Full day with seafood lunch", 6500, 60, True),
                ("Mombasa airport transfer", "Per vehicle, each way", 4500, 40, False),
            ],
            valid_to_days=210,
        ),
        dict(
            title="Watamu Beach Escape – 3 Nights",
            destination="watamu-malindi",
            categories=["beach", "honeymoon"],
            tour_type="private",
            days=4,
            nights=3,
            difficulty="easy",
            min_group=1,
            max_group=8,
            start="Malindi Airport",
            end="Malindi Airport",
            transport="Private transfers",
            accommodation_level="Mid-range",
            hero="watamu",
            gallery=["diani2", "camels"],
            is_deal=True,
            deal_label="Low-season deal",
            summary="Turquoise lagoons, marine park snorkelling and Mida Creek sunsets.",
            description="Fly into Malindi and transfer to a boutique resort in Watamu. Snorkel the marine park, "
            "explore the Gede Ruins and watch the sun set over Mida Creek.",
            highlights=["Watamu Marine Park", "Gede Ruins", "Mida Creek sunset"],
            inclusions=["Airport transfers", "3 nights bed & breakfast"],
            exclusions=["Flights", "Excursions"],
            prices={
                "resident": ("KES", 38900, 19500, 14000, 44000),
                "non_resident": ("USD", 420, 210, 150, 480),
            },
            itinerary=[
                ("Arrive Watamu", "Transfer from Malindi airport.", "Watamu boutique resort", "-", "Watamu"),
                (
                    "Marine park",
                    "Snorkel or take a glass-bottom boat.",
                    "Watamu boutique resort",
                    "B",
                    "Watamu",
                ),
                (
                    "Gede & Mida Creek",
                    "Visit the 12th-century ruins, sunset at Mida Creek.",
                    "Watamu boutique resort",
                    "B",
                    "Mida Creek",
                ),
                ("Depart", "Transfer to Malindi airport.", None, "B", "Malindi"),
            ],
            map=[("Malindi", -3.2192, 40.1169, 1), ("Watamu", -3.354, 40.019, 1)],
            add_ons=[("Return flights Nairobi–Malindi", "Economy, 20kg baggage", 17500, 140, True)],
        ),
        dict(
            title="Hell's Gate & Lake Naivasha Day Trip",
            destination="lake-naivasha",
            categories=["day-trips", "adventure", "family"],
            tour_type="day_trip",
            days=1,
            nights=0,
            difficulty="moderate",
            min_group=1,
            max_group=14,
            start="Nairobi",
            end="Nairobi",
            transport="Safari minivan",
            hero="hellsgate",
            gallery=["naivasha"],
            summary="Cycle among zebras, hike the gorge and take a boat ride with hippos, all in one day.",
            description="Hell's Gate is one of the few Kenyan parks where you can cycle and walk among the wildlife. "
            "After hiking the Ol Njorowa gorge, we head to Lake Naivasha for a boat ride.",
            highlights=["Bike ride past zebra and giraffe", "Ol Njorowa gorge hike", "Hippo boat ride"],
            inclusions=["Transport", "Park fees", "Bike hire", "Boat ride", "Gorge guide"],
            exclusions=["Lunch", "Tips"],
            prices={"resident": ("KES", 7500, 5000, None), "non_resident": ("USD", 85, 60, None)},
            itinerary=[
                (
                    "Hell's Gate & Naivasha",
                    "6:30am departure, cycle and hike Hell's Gate, afternoon boat "
                    "ride on the lake, back in Nairobi by 7pm.",
                    None,
                    "-",
                    "Hell's Gate",
                )
            ],
            map=[("Nairobi", -1.2921, 36.8219, 1), ("Hell's Gate", -0.9, 36.32, 1)],
            add_ons=[("Packed lunch", "Sandwiches, fruit and juice", 900, 8, True)],
        ),
        dict(
            title="Nairobi National Park & Giraffe Centre",
            destination="nairobi",
            categories=["day-trips", "family"],
            tour_type="day_trip",
            days=1,
            nights=0,
            difficulty="easy",
            min_group=1,
            max_group=7,
            start="Your Nairobi hotel",
            end="Your Nairobi hotel",
            transport="4x4 Land Cruiser",
            hero="own_lions_vehicle",
            gallery=["own_rhino", "nairobi_np", "giraffe_centre"],
            featured=True,
            summary="Lions with a skyline view in the morning, feed giraffes in the afternoon.",
            description="Ideal for a layover or your first day in Kenya. Morning game drive in Nairobi National Park, "
            "then the Giraffe Centre in Karen to meet endangered Rothschild's giraffes up close.",
            highlights=["Rhino and lions in the city", "Feed giraffes at eye level", "Hotel pick-up"],
            inclusions=["Transport", "Park & Giraffe Centre fees", "Guide", "Bottled water"],
            exclusions=["Lunch", "Tips"],
            prices={"resident": ("KES", 9800, 6500, None), "non_resident": ("USD", 145, 95, None)},
            itinerary=[
                (
                    "City safari",
                    "Pick-up 6am, game drive until noon, then the Giraffe Centre.",
                    None,
                    "-",
                    "Nairobi",
                )
            ],
            map=[("Nairobi National Park", -1.3733, 36.8589, 1), ("Giraffe Centre", -1.3758, 36.7447, 1)],
            add_ons=[("Sheldrick elephant orphanage", "11am public visit", 2000, 15, True)],
        ),
        dict(
            title="5-Day Mount Kenya Trek: Sirimon–Chogoria",
            destination="mount-kenya",
            categories=["adventure"],
            tour_type="scheduled",
            days=5,
            nights=4,
            difficulty="challenging",
            min_group=2,
            max_group=10,
            start="Nairobi",
            end="Nairobi",
            transport="Road transfer",
            accommodation_level="Mountain huts",
            hero="mtkenya",
            gallery=["mtkenya2"],
            deposit=40,
            balance_days=21,
            summary="Summit Point Lenana at sunrise and descend past the Gorges Valley lakes.",
            description="The most scenic route up Mount Kenya: up the quieter Sirimon route, summit Point Lenana "
            "(4,985 m) at dawn, and descend the Chogoria route past Lake Michaelson and the Gorges Valley.",
            highlights=[
                "Point Lenana summit at sunrise",
                "Lake Michaelson",
                "Experienced mountain guides & porters",
            ],
            inclusions=["Park fees", "Guides, cooks & porters", "All meals on the mountain", "Huts & tents"],
            exclusions=["Sleeping bag hire", "Tips"],
            prices={"resident": ("KES", 68000, None, None), "non_resident": ("USD", 950, None, None)},
            itinerary=[
                (
                    "To Old Moses",
                    "Drive to Sirimon gate and trek to Old Moses camp (3,300 m).",
                    "Old Moses camp",
                    "L, D",
                    "Sirimon",
                ),
                (
                    "Shipton's camp",
                    "Trek up the Mackinder valley to Shipton's (4,200 m).",
                    "Shipton's camp",
                    "B, L, D",
                    "Mackinder Valley",
                ),
                (
                    "Summit Lenana",
                    "2am start, sunrise on Point Lenana, descend to Mintos.",
                    "Mintos camp",
                    "B, L, D",
                    "Point Lenana",
                ),
                (
                    "Gorges Valley",
                    "Descend past Lake Michaelson to the Chogoria bandas.",
                    "Chogoria bandas",
                    "B, L, D",
                    "Chogoria",
                ),
                ("Return", "Walk out and drive back to Nairobi.", None, "B, L", "Nairobi"),
            ],
            map=[
                ("Sirimon gate", 0.0167, 37.24, 1),
                ("Point Lenana", -0.1521, 37.3084, 3),
                ("Chogoria", -0.23, 37.62, 4),
            ],
            add_ons=[("Sleeping bag hire", "-10°C rated", 2500, 20, True)],
            departures=("biweekly", 3, 12),
        ),
        dict(
            title="3-Day Samburu Special Five Safari",
            destination="samburu",
            categories=["safari"],
            tour_type="scheduled",
            days=3,
            nights=2,
            difficulty="easy",
            min_group=2,
            max_group=7,
            start="Nairobi",
            end="Nairobi",
            transport="4x4 Land Cruiser",
            accommodation_level="Mid-range",
            hero="samburu",
            gallery=["samburu2", "own_buffalo"],
            summary="Find the northern specials along the Ewaso Nyiro river.",
            description="Drive north past Mount Kenya to Samburu, where the Ewaso Nyiro river draws elephants, "
            "leopards and five species you won't see further south.",
            highlights=["Reticulated giraffe & Grevy's zebra", "Leopard country", "Samburu cultural visit"],
            inclusions=["Park fees", "2 nights full board", "Game drives"],
            exclusions=["Tips", "Drinks"],
            prices={"resident": ("KES", 54000, 36000, 8000), "non_resident": ("USD", 820, 560, 110)},
            itinerary=[
                (
                    "Drive north",
                    "Via Nanyuki and the equator to Samburu.",
                    "Samburu lodge",
                    "L, D",
                    "Samburu",
                ),
                (
                    "Samburu full day",
                    "Morning and afternoon game drives.",
                    "Samburu lodge",
                    "B, L, D",
                    "Samburu",
                ),
                ("Return", "Morning game drive, return to Nairobi.", None, "B, L", "Nairobi"),
            ],
            map=[("Nairobi", -1.2921, 36.8219, 1), ("Samburu", 0.6167, 37.5333, 1)],
            add_ons=[],
            departures=("biweekly", 4, 9),
        ),
        dict(
            title="7-Day Kenya Grand Safari",
            destination="maasai-mara",
            categories=["safari", "honeymoon"],
            tour_type="private",
            days=7,
            nights=6,
            difficulty="easy",
            min_group=2,
            max_group=6,
            start="Nairobi",
            end="Nairobi",
            transport="Private 4x4 Land Cruiser",
            accommodation_level="Luxury",
            hero="mara_lion",
            gallery=["own_lionesses", "own_cheetah", "amboseli", "own_rhino", "mara_balloon"],
            featured=True,
            deposit=40,
            balance_days=60,
            summary="Private Land Cruiser, luxury camps, and three of Kenya's best parks.",
            description="Our signature private safari visits Amboseli, Lake Nakuru and the Maasai Mara, staying in "
            "luxury tented camps. With your own vehicle and guide you set the pace, from long lunches to dawn "
            "starts.",
            highlights=["Private vehicle and guide", "Luxury tented camps", "Three iconic parks"],
            inclusions=[
                "Park fees",
                "6 nights luxury full board",
                "Private vehicle & guide",
                "Airport transfers",
            ],
            exclusions=["International flights", "Visas", "Tips"],
            prices={"resident": ("KES", 245000, 165000, 52000), "non_resident": ("USD", 3450, 2300, 650)},
            itinerary=[
                (
                    "Nairobi to Amboseli",
                    "Private transfer and afternoon drive.",
                    "Luxury camp, Amboseli",
                    "L, D",
                    "Amboseli",
                ),
                (
                    "Amboseli",
                    "Full day with Kilimanjaro views.",
                    "Luxury camp, Amboseli",
                    "B, L, D",
                    "Amboseli",
                ),
                (
                    "To Lake Nakuru",
                    "Drive through the Rift Valley to Nakuru.",
                    "Lodge, Nakuru",
                    "B, L, D",
                    "Nakuru",
                ),
                (
                    "To the Mara",
                    "Morning rhino drive, then on to the Mara.",
                    "Luxury camp, Mara",
                    "B, L, D",
                    "Maasai Mara",
                ),
                ("Maasai Mara", "Full day in the reserve.", "Luxury camp, Mara", "B, L, D", "Maasai Mara"),
                (
                    "Maasai Mara",
                    "Optional balloon safari and bush dinner.",
                    "Luxury camp, Mara",
                    "B, L, D",
                    "Maasai Mara",
                ),
                ("Fly to Nairobi", "Morning flight back to Wilson Airport.", None, "B", "Nairobi"),
            ],
            map=[
                ("Nairobi", -1.2921, 36.8219, 1),
                ("Amboseli", -2.6527, 37.2606, 1),
                ("Lake Nakuru", -0.3667, 36.0833, 3),
                ("Maasai Mara", -1.4061, 35.0081, 4),
            ],
            add_ons=[
                ("Hot-air balloon safari", "With champagne breakfast", 62000, 480, True),
                ("Bush dinner", "Private dinner under the stars", 9500, 75, True),
            ],
        ),
        dict(
            title="Lamu Old Town Cultural Escape",
            destination="lamu",
            categories=["culture", "beach", "honeymoon"],
            tour_type="private",
            days=4,
            nights=3,
            difficulty="easy",
            min_group=1,
            max_group=8,
            start="Wilson Airport, Nairobi",
            end="Wilson Airport, Nairobi",
            transport="Return flights + dhow",
            accommodation_level="Boutique",
            hero="lamu",
            gallery=["lamu2"],
            summary="Swahili architecture, dhow sailing and slow days in Shela.",
            description="Fly to Lamu and step back in time. Walk the lanes of the UNESCO-listed Old Town, sail at "
            "sunset on a traditional dhow and laze on Shela's dunes.",
            highlights=["Guided Old Town walk", "Sunset dhow cruise", "Swahili cooking class"],
            inclusions=[
                "Return flights from Nairobi",
                "3 nights B&B in a Swahili house",
                "Old Town tour",
                "Dhow cruise",
            ],
            exclusions=["Lunches & dinners", "Tips"],
            prices={"resident": ("KES", 72000, 48000, 21000), "non_resident": ("USD", 690, 460, 200)},
            itinerary=[
                (
                    "Fly to Lamu",
                    "Morning flight, boat to your Swahili house.",
                    "Swahili house, Lamu",
                    "-",
                    "Lamu",
                ),
                (
                    "Old Town",
                    "Guided walk, museum and Swahili cooking class.",
                    "Swahili house, Lamu",
                    "B",
                    "Lamu",
                ),
                (
                    "Dhow day",
                    "Sail to Manda island, snorkel and seafood barbecue.",
                    "Swahili house, Lamu",
                    "B",
                    "Manda",
                ),
                ("Fly home", "Morning in Shela, afternoon flight to Nairobi.", None, "B", "Nairobi"),
            ],
            map=[("Lamu", -2.2717, 40.902, 1), ("Shela", -2.293, 40.912, 4)],
            add_ons=[],
        ),
        dict(
            title="Zanzibar Beach Holiday – 5 Days",
            destination="zanzibar",
            categories=["beach", "international", "honeymoon"],
            tour_type="private",
            days=5,
            nights=4,
            difficulty="easy",
            min_group=1,
            max_group=10,
            start="Jomo Kenyatta International Airport",
            end="Jomo Kenyatta International Airport",
            transport="Return flights + transfers",
            accommodation_level="Mid-range",
            hero="zanzibar",
            gallery=["stone_town"],
            featured=True,
            summary="Return flights from Nairobi, Stone Town and four nights on Nungwi's beaches.",
            description="An easy island escape: fly from Nairobi, explore Stone Town's spice markets, then relax on "
            "the north coast with all-inclusive dining.",
            highlights=[
                "Return flights from Nairobi",
                "Stone Town walking tour",
                "All-inclusive beach resort",
            ],
            inclusions=["Return flights", "Transfers", "4 nights all-inclusive", "Stone Town tour"],
            exclusions=["Visa (if required)", "Zanzibar infrastructure tax", "Tips"],
            prices={"resident": ("KES", 98000, 62000, 28000), "non_resident": ("USD", 820, 520, 230)},
            itinerary=[
                (
                    "Fly to Zanzibar",
                    "Afternoon Stone Town walking tour.",
                    "Stone Town hotel",
                    "D",
                    "Stone Town",
                ),
                ("To Nungwi", "Spice farm visit on the way north.", "Nungwi resort", "B, L, D", "Nungwi"),
                ("Beach day", "Swim, snorkel or sunset dhow.", "Nungwi resort", "B, L, D", "Nungwi"),
                ("Beach day", "Optional Mnemba atoll trip.", "Nungwi resort", "B, L, D", "Nungwi"),
                ("Fly home", "Transfer and return flight to Nairobi.", None, "B", "Nairobi"),
            ],
            map=[("Stone Town", -6.1622, 39.1921, 1), ("Nungwi", -5.7264, 39.2985, 2)],
            add_ons=[("Mnemba atoll snorkelling", "Half day with dolphins", 9000, 70, True)],
        ),
        dict(
            title="4-Day Rwanda Gorilla Trekking",
            destination="rwanda",
            categories=["international", "adventure"],
            tour_type="scheduled",
            days=4,
            nights=3,
            difficulty="moderate",
            min_group=1,
            max_group=8,
            start="Kigali",
            end="Kigali",
            transport="4x4 vehicle",
            accommodation_level="Mid-range",
            hero="gorilla",
            gallery=[],
            deposit=50,
            balance_days=60,
            summary="A gorilla permit, golden monkeys and Kigali, with everything arranged for you.",
            description="Gorilla permits are limited, so we secure yours as soon as you book. Trek in Volcanoes "
            "National Park, see golden monkeys and visit Kigali.",
            highlights=["Gorilla permit included", "Golden monkey trek", "Kigali city tour"],
            inclusions=["Gorilla permit", "Golden monkey permit", "3 nights full board", "Transport & guide"],
            exclusions=["Flights to Kigali", "Visa", "Porters", "Tips"],
            prices={"resident": ("KES", 165000, None, 25000), "non_resident": ("USD", 2650, None, 190)},
            itinerary=[
                ("Kigali to Musanze", "Kigali tour, drive to Musanze.", "Musanze lodge", "L, D", "Musanze"),
                (
                    "Gorilla trek",
                    "Trek to a habituated gorilla family.",
                    "Musanze lodge",
                    "B, L, D",
                    "Volcanoes NP",
                ),
                (
                    "Golden monkeys",
                    "Morning golden monkey trek, afternoon at leisure.",
                    "Musanze lodge",
                    "B, L, D",
                    "Volcanoes NP",
                ),
                ("Return to Kigali", "Drive back for your flight.", None, "B", "Kigali"),
            ],
            map=[("Kigali", -1.9441, 30.0619, 1), ("Volcanoes NP", -1.43, 29.59, 2)],
            add_ons=[("Porter", "Carries your day pack on the trek", 2600, 20, True)],
            departures=("monthly", 2, 6),
        ),
        dict(
            title="Dubai City & Desert – 6 Days",
            destination="dubai",
            categories=["international", "family"],
            tour_type="scheduled",
            days=6,
            nights=5,
            difficulty="easy",
            min_group=1,
            max_group=20,
            start="Jomo Kenyatta International Airport",
            end="Jomo Kenyatta International Airport",
            transport="Return flights + coach",
            accommodation_level="4-star",
            hero="dubai",
            gallery=["dubai_desert"],
            is_deal=True,
            deal_label="Group departure",
            summary="Group trip with flights, a 4-star hotel, desert safari and Burj Khalifa tickets.",
            description="Travel with a Safiri Nasi host on our escorted Dubai group trip: flights, visa processing, "
            "a central 4-star hotel, a desert safari with BBQ dinner and the view from the Burj Khalifa.",
            highlights=[
                "Return flights from Nairobi",
                "Visa processing",
                "Desert safari with BBQ",
                "Burj Khalifa",
            ],
            inclusions=[
                "Return flights",
                "UAE visa",
                "5 nights B&B",
                "City tour",
                "Desert safari",
                "Burj Khalifa tickets",
            ],
            exclusions=["Lunches & dinners", "Tourism dirham fee", "Shopping"],
            prices={
                "resident": ("KES", 159000, 129000, 38000, 172000),
                "non_resident": ("USD", 1290, 1050, 300, 1390),
            },
            itinerary=[
                ("Fly to Dubai", "Evening at leisure.", "4-star hotel, Dubai", "-", "Dubai"),
                ("City tour", "Dubai Creek, souks and Burj Khalifa.", "4-star hotel, Dubai", "B", "Dubai"),
                (
                    "Desert safari",
                    "Dune bashing, camel ride and BBQ dinner.",
                    "4-star hotel, Dubai",
                    "B, D",
                    "Desert",
                ),
                ("Free day", "Shopping or theme parks.", "4-star hotel, Dubai", "B", "Dubai"),
                ("Abu Dhabi option", "Optional Abu Dhabi day trip.", "4-star hotel, Dubai", "B", "Dubai"),
                ("Fly home", "Return to Nairobi.", None, "B", "Nairobi"),
            ],
            map=[("Dubai", 25.2048, 55.2708, 1), ("Desert camp", 24.9, 55.6, 3)],
            add_ons=[("Abu Dhabi day trip", "Sheikh Zayed Mosque & Louvre", 11000, 85, True)],
            departures=("monthly", 3, 18),
        ),
    ]


REVIEWS = [
    (
        "Wanjiru K.",
        "Kenya",
        5,
        "Best weekend ever",
        "The Naivasha boat ride and Nakuru rhinos were amazing. Everything "
        "ran on time and paying the deposit by M-Pesa was so easy.",
        "lake-naivasha-nakuru",
    ),
    (
        "Daniel M.",
        "United Kingdom",
        5,
        "Saw a river crossing!",
        "Our guide Joseph knew exactly where to wait. We saw "
        "two crossings in one day. Camp was comfortable and the food excellent.",
        "great-migration",
    ),
    (
        "Aisha O.",
        "Kenya",
        5,
        "Perfect coast getaway",
        "The SGR plus hotel package made planning effortless. "
        "Safiri Nasi even sorted our first-class upgrade last minute.",
        "diani",
    ),
    (
        "Brian & Faith",
        "Kenya",
        5,
        "Honeymoon dream",
        "Zanzibar was magical. Thank you for handling everything from flights to the Stone Town tour.",
        "zanzibar",
    ),
    (
        "Sophie L.",
        "France",
        4,
        "Great value safari",
        "Shared vehicle but never crowded, and we saw all of the Big Five "
        "except rhino. Would recommend the balloon add-on.",
        "maasai-mara-budget",
    ),
    (
        "Kevin O.",
        "Kenya",
        5,
        "Tough but worth it",
        "Sunrise on Point Lenana is something I will never forget. The guides and porters were brilliant.",
        "mount-kenya",
    ),
    (
        "Grace N.",
        "Uganda",
        5,
        "Kids loved it",
        "We did the Nairobi park and Giraffe Centre with our two kids. Short, fun and well organised.",
        "nairobi-national-park",
    ),
    (
        "Marco R.",
        "Italy",
        5,
        "Elephants and Kilimanjaro",
        "Amboseli delivered the postcard shot on our first morning. Tsavo was a wonderful contrast.",
        "amboseli",
    ),
    (
        "Linet A.",
        "Kenya",
        4,
        "Lovely Lamu",
        "Slow and beautiful. The dhow cruise at sunset was the highlight.",
        "lamu",
    ),
    (
        "James & Emma",
        "United States",
        5,
        "Truly special",
        "Our private Grand Safari was flawless. Our guide went out of his way to find a leopard for us.",
        "grand-safari",
    ),
]

FAQS = [
    (
        "Booking & payment",
        "How do I pay?",
        "Pay securely online with M-Pesa, Airtel Money or Visa/Mastercard. Payments are processed by Paystack "
        "and you get an instant receipt by email.",
    ),
    (
        "Booking & payment",
        "How much deposit do I need?",
        "Most trips need a 30% deposit to confirm (40–50% for "
        "migration safaris and gorilla trekking, where permits must be bought upfront). The balance is due before you "
        "travel. Your booking shows the exact date.",
    ),
    (
        "Booking & payment",
        "Is my seat held while I pay?",
        "Yes. We hold your seats for 30 minutes after you book so you can complete payment.",
    ),
    (
        "Booking & payment",
        "Can I pay in US dollars?",
        "Yes. Card payments can be made in KES or USD. Mobile money is "
        "always charged in KES at the exchange rate shown at checkout.",
    ),
    (
        "Booking & payment",
        "What are resident and non-resident rates?",
        "Kenyan park fees are lower for East African "
        "citizens and residents. Choose 'Resident' if you hold an East African ID or residence permit; you'll be asked "
        "to show it at the park gate.",
    ),
    (
        "Booking & payment",
        "What is your cancellation policy?",
        "Each tour lists its cancellation terms. In general, "
        "deposits are refundable (less fees) if you cancel more than 30–60 days before travel. Date changes are free up "
        "to 21 days before departure, subject to availability.",
    ),
    (
        "Travel",
        "Do I need a visa for Kenya?",
        "Kenya uses an Electronic Travel Authorisation (eTA) for most visitors. "
        "Apply online at least a week before you travel. East African citizens don't need one.",
    ),
    (
        "Travel",
        "What should I pack for a safari?",
        "Neutral-coloured layers, a warm jacket for early drives, a hat, "
        "sunscreen, binoculars and a soft bag (not a hard suitcase).",
    ),
    (
        "Travel",
        "Is a safari suitable for children?",
        "Absolutely. Our family trips have shorter drives and lodges with "
        "pools. Some camps have minimum ages, which we'll flag when you book.",
    ),
    (
        "Travel",
        "When is the best time to see the Great Migration?",
        "River crossings in the Maasai Mara usually happen "
        "between July and October. The exact timing depends on the rains.",
    ),
    (
        "Tailor-made",
        "Can you design a private trip?",
        "Yes, that's what we love doing. Fill in our tailor-made form "
        "or WhatsApp us, and a travel expert will send you an itinerary and quote within one working day.",
    ),
    (
        "Tailor-made",
        "Do you organise corporate and group travel?",
        "We arrange team-building retreats, school trips and group holidays. Ask us for a group quote.",
    ),
]

BLOG = [
    (
        "When is the best time to visit the Maasai Mara?",
        "mara_balloon",
        "The Mara is great all year, but the Great Migration from July to October is unforgettable. Here's how to choose.",
        "## Every month is a good month\n\nThe Maasai Mara has resident lions, cheetahs and elephants all year, so there "
        "is no bad time to visit. What changes is the crowds, the grass height and of course the herds.\n\n"
        "## July to October: the Great Migration\n\nOver a million wildebeest and zebra follow the rains north from the "
        "Serengeti. River crossings are dramatic and unpredictable, so give yourself at least three full days.\n\n"
        "## November to June: green season\n\nShort rains in November and long rains in April and May bring lush "
        "landscapes, newborn animals and lower prices. Roads can be muddy, but the photography is superb.\n\n"
        "**Tip:** book migration departures 3–6 months ahead. Camps near the river fill up quickly.",
        ["safari", "planning"],
    ),
    (
        "Taking the SGR to the coast: a complete guide",
        "sgr",
        "Everything you need to know about the Madaraka Express, from tickets to luggage to the best seats.",
        "## Why take the train?\n\nThe Madaraka Express links Nairobi and Mombasa in about five hours, with views of "
        "Tsavo along the way. Look out for elephants!\n\n## Economy or first class?\n\nEconomy is comfortable and great "
        "value; first class has wider seats and fewer passengers. We include economy in our Diani packages and offer a "
        "first-class upgrade.\n\n## Arriving at Mombasa Terminus\n\nThe terminus is in Miritini, about 40 minutes from "
        "Diani by road with the ferry, so we always arrange your transfer.",
        ["coast", "tips"],
    ),
    (
        "Paying for your trip with M-Pesa: how it works",
        "safari_vehicle",
        "Our checkout sends an M-Pesa prompt straight to your phone. Here's what to expect.",
        "## STK push in three steps\n\n1. Choose **M-Pesa** at checkout and enter your Safaricom number.\n2. A prompt "
        "appears on your phone: check the amount and the Safiri Nasi name.\n3. Enter your M-Pesa PIN. Your booking "
        "updates automatically within seconds.\n\n## Airtel Money and cards\n\nAirtel Money works the same way. "
        "Visa and Mastercard payments open Paystack's secure checkout and bring you straight back.\n\n"
        "## Is it safe?\n\nAll payments are processed by Paystack. We never see your PIN or card number, and "
        "every payment is confirmed with Paystack before your booking updates.",
        ["payments", "tips"],
    ),
]


def departure_dates(pattern: str, first_offset: int, count_hint: int) -> list[tuple[date, Decimal]]:
    today = date.today()
    start = today + timedelta(days=first_offset or 5)
    out: list[tuple[date, Decimal]] = []
    if pattern == "weekly":
        d = start
        while d <= today + timedelta(days=180):
            out.append((d, D(10) if d.month in (12, 7, 8) else D(0)))
            d += timedelta(days=7)
    elif pattern == "biweekly":
        d = start
        while d <= today + timedelta(days=200):
            out.append((d, D(0)))
            d += timedelta(days=14)
    elif pattern == "monthly":
        d = start
        for _ in range(7):
            out.append((d, D(0)))
            d += timedelta(days=30)
    elif pattern == "migration":
        year = today.year + (1 if today.month > 8 else 0)
        d = date(year, 7, 3)
        while d <= date(year, 10, 20):
            out.append((d, D(15) if d.month in (8, 9) else D(10)))
            d += timedelta(days=7)
    return out


async def reset_database() -> None:
    async with engine.begin() as conn:
        tables = ", ".join(f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables))
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


async def seed(demo: bool, if_empty: bool = False) -> None:
    rng = random.Random(42)
    async with SessionLocal() as db:
        if await db.scalar(select(Tour.id).limit(1)):
            if if_empty:
                print("Database already has data; skipping seed.")
                return
            raise SystemExit("Database already has tours. Use --reset to wipe and re-seed.")
        # The demo passwords below are public (README); never use them on a deployed site.
        staff_password = secrets.token_urlsafe(18) if settings.is_production else "SafiriStaff#2026"
        customer_password = secrets.token_urlsafe(18) if settings.is_production else "Traveller#2026"

        admin = User(
            email=settings.seed_admin_email,
            full_name="Safiri Nasi Admin",
            role=Role.admin,
            password_hash=hash_password(settings.seed_admin_password),
            phone="+254700000000",
        )
        staff = User(
            email="staff@safirinasitourstravel.co.ke",
            full_name="Jane Wambui",
            role=Role.staff,
            password_hash=hash_password(staff_password),
        )
        customer = User(
            email="traveller@example.com",
            full_name="Amani Traveller",
            role=Role.customer,
            password_hash=hash_password(customer_password),
            phone="+254712345678",
            country="Kenya",
        )
        db.add_all([admin, staff, customer])

        categories = {}
        for i, (name, slug, desc, icon, image) in enumerate(CATEGORIES):
            categories[slug] = Category(
                name=name, slug=slug, description=desc, icon=icon, image=img(image), sort_order=i
            )
        db.add_all(categories.values())

        destinations = {}
        for i, d in enumerate(DESTINATIONS):
            slug = d["name"].lower().replace(" & ", "-").replace(" ", "-")
            destinations[slug] = Destination(
                name=d["name"],
                slug=slug,
                region=d["region"],
                country=d["country"],
                summary=d["summary"],
                description=d["description"],
                hero_image=img(d["image"]),
                gallery=[img(k) for k in d.get("gallery", [])],
                best_time=d["best_time"],
                highlights=d["highlights"],
                latitude=d["lat"],
                longitude=d["lng"],
                featured=d.get("featured", False),
                sort_order=i,
            )
        db.add_all(destinations.values())
        await db.flush()

        tours: list[Tour] = []
        for t in tour_defs():
            slug = slugify(t["title"].replace("'", ""))
            tour = Tour(
                title=t["title"],
                slug=slug,
                summary=t["summary"],
                description=t["description"],
                destination_id=destinations[t["destination"]].id,
                tour_type=t["tour_type"],
                duration_days=t["days"],
                duration_nights=t["nights"],
                difficulty=t["difficulty"],
                min_group=t["min_group"],
                max_group=t["max_group"],
                start_location=t["start"],
                end_location=t["end"],
                transport=t["transport"],
                accommodation_level=t.get("accommodation_level"),
                hero_image=img(t["hero"]),
                gallery=[img(k) for k in t["gallery"]],
                highlights=t["highlights"],
                inclusions=t["inclusions"],
                exclusions=t["exclusions"],
                map_points=[{"name": n, "lat": la, "lng": ln, "day": dy} for n, la, ln, dy in t["map"]],
                faqs=[{"question": q, "answer": a} for q, a in t.get("faqs", [])],
                tags=[categories[c].name for c in t["categories"]][:3],
                deposit_percent=t.get("deposit", 30),
                balance_due_days=t.get("balance_days", 30),
                cancellation_policy=t.get("cancellation"),
                status=PublishStatus.published,
                featured=t.get("featured", False),
                is_deal=t.get("is_deal", False),
                deal_label=t.get("deal_label"),
                valid_to=date.today() + timedelta(days=t["valid_to_days"])
                if t.get("valid_to_days")
                else None,
                seo_description=t["summary"][:300],
                popularity=rng.randint(5, 80),
            )
            tour.categories = [categories[c] for c in t["categories"]]
            tour.itinerary = [
                ItineraryDay(
                    day_number=i + 1,
                    title=title,
                    description=desc,
                    accommodation=acc,
                    meals=meals,
                    location=loc,
                )
                for i, (title, desc, acc, meals, loc) in enumerate(t["itinerary"])
            ]
            for rate, values in t["prices"].items():
                currency, adult, child, supp, *compare = values
                tour.prices.append(
                    TourPrice(
                        rate_category=rate,
                        currency=currency,
                        adult_price=D(adult),
                        child_price=D(child) if child else None,
                        single_supplement=D(supp) if supp else None,
                        compare_at_price=D(compare[0]) if compare else None,
                    )
                )
            tour.add_ons = [
                AddOn(name=n, description=desc, price_kes=D(kes), price_usd=D(usd), per_person=pp)
                for n, desc, kes, usd, pp in t.get("add_ons", [])
            ]
            if t.get("departures"):
                pattern, offset, _ = t["departures"]
                for start, adj in departure_dates(pattern, offset, 0):
                    booked = (
                        rng.choice([0, 0, 2, 3, 4, 5]) if start < date.today() + timedelta(days=60) else 0
                    )
                    tour.departures.append(
                        Departure(
                            start_date=start,
                            end_date=start + timedelta(days=t["days"] - 1),
                            capacity=t["max_group"] if t["max_group"] <= 12 else 16,
                            seats_booked=min(booked, t["max_group"] - 1),
                            price_adjustment_percent=adj,
                            status="guaranteed" if booked >= 4 else "open",
                        )
                    )
            tours.append(tour)
        db.add_all(tours)
        await db.flush()

        by_key = {
            "lake-naivasha-nakuru": tours[3],
            "great-migration": tours[1],
            "diani": tours[4],
            "zanzibar": tours[12],
            "maasai-mara-budget": tours[0],
            "mount-kenya": tours[8],
            "nairobi-national-park": tours[7],
            "amboseli": tours[2],
            "lamu": tours[11],
            "grand-safari": tours[10],
        }
        for i, (name, country, rating, title, body, key) in enumerate(REVIEWS):
            tour = by_key[key]
            db.add(
                Review(
                    tour_id=tour.id,
                    name=name,
                    country=country,
                    rating=rating,
                    title=title,
                    body=body,
                    travel_month=(date.today() - timedelta(days=30 * (i + 1))).strftime("%B %Y"),
                    status="approved",
                    featured=rating == 5 and i < 8,
                    verified=True,
                )
            )
            tour.rating_count += 1
            tour.rating_avg = (
                D(rating)
                if tour.rating_count == 1
                else money((tour.rating_avg * (tour.rating_count - 1) + rating) / tour.rating_count, "USD")
            )
        db.add(
            Review(
                tour_id=tours[0].id,
                name="Peter K.",
                country="Kenya",
                rating=4,
                title="Good trip",
                body="Driver was great, camp was basic but clean. Pending moderation example.",
                status="pending",
                verified=True,
            )
        )

        for i, (category, q, a) in enumerate(FAQS):
            db.add(Faq(question=q, answer=a, category=category, sort_order=i))
        for i, (title, image, excerpt, body, tags) in enumerate(BLOG):
            db.add(
                BlogPost(
                    title=title,
                    slug=title.lower().split(":")[0].replace("?", "").replace(" ", "-"),
                    excerpt=excerpt,
                    body=body,
                    cover_image=img(image),
                    author_name="Safiri Nasi Team",
                    tags=tags,
                    status="published",
                    published_at=datetime.now(UTC) - timedelta(days=12 * (i + 1)),
                )
            )
        db.add_all(
            [
                PromoCode(
                    code="KARIBU10",
                    description="10% off your first trip",
                    discount_type="percent",
                    value=D(10),
                    max_uses=500,
                ),
                PromoCode(
                    code="SGR2000",
                    description="KES 2,000 off coast holidays",
                    discount_type="fixed",
                    value=D(2000),
                    currency="KES",
                    min_total=D(30000),
                ),
            ]
        )
        await db.flush()

        if demo:
            await seed_demo_bookings(db, tours, customer, admin, rng)
        await db.commit()
        print(f"Seeded {len(tours)} tours, {len(destinations)} destinations.")
        if settings.is_production:
            print(f"Admin login: {settings.seed_admin_email} (password from SEED_ADMIN_PASSWORD)")
        else:
            print(f"Admin login: {settings.seed_admin_email} / {settings.seed_admin_password}")
        if not settings.is_production:
            print(f"Staff login: staff@safirinasitourstravel.co.ke / {staff_password}")
            print(f"Customer login: traveller@example.com / {customer_password}")


NAMES = [
    ("Wanjiru Kamau", "Kenya"),
    ("Otieno Odhiambo", "Kenya"),
    ("Fatma Hassan", "Kenya"),
    ("Kiprono Rotich", "Kenya"),
    ("Achieng Atieno", "Kenya"),
    ("Mwangi Njoroge", "Kenya"),
    ("Sarah Johnson", "United Kingdom"),
    ("Lukas Weber", "Germany"),
    ("Chloé Martin", "France"),
    ("Michael Brown", "United States"),
    ("Nasra Abdi", "Kenya"),
    ("Brian Kiplagat", "Kenya"),
    ("Aiko Tanaka", "Japan"),
    ("Grace Mutua", "Kenya"),
    ("Daniel Ochieng", "Kenya"),
    ("Isabella Rossi", "Italy"),
]


async def seed_demo_bookings(db, tours: list[Tour], customer: User, admin: User, rng: random.Random) -> None:
    """Past and upcoming bookings with payments so the admin dashboard has something to show."""
    today = date.today()
    methods = ["mpesa", "mpesa", "mpesa", "mpesa", "airtel", "card", "card", "bank"]
    for i in range(34):
        tour = rng.choice(tours)
        name, country = NAMES[i % len(NAMES)]
        resident = country == "Kenya"
        price = next(
            p for p in tour.prices if p.rate_category == ("resident" if resident else "non_resident")
        )
        adults, children = rng.choice([(1, 0), (2, 0), (2, 1), (2, 2), (4, 0), (3, 0)])
        created = datetime.now(UTC) - timedelta(days=rng.randint(1, 330))
        travel = created.date() + timedelta(days=rng.randint(10, 120))
        unit_child = price.child_price or price.adult_price
        total = money(price.adult_price * adults + unit_child * children, price.currency)
        deposit = money(total * tour.deposit_percent / 100, price.currency)
        if travel < today:
            status, paid = BookingStatus.completed, total
        elif rng.random() < 0.5:
            status, paid = BookingStatus.confirmed, deposit
        elif rng.random() < 0.7:
            status, paid = BookingStatus.fully_paid, total
        else:
            status, paid = BookingStatus.pending_payment, D(0)
        booking = Booking(
            reference=new_reference(),
            user_id=customer.id if i % 9 == 0 else None,
            tour_id=tour.id,
            travel_date=travel,
            end_date=travel + timedelta(days=tour.duration_days - 1),
            adults=adults,
            children=children,
            rate_category="resident" if resident else "non_resident",
            currency=price.currency,
            contact_name=customer.full_name if i % 9 == 0 else name,
            contact_email=customer.email if i % 9 == 0 else f"{name.split()[0].lower()}{i}@example.com",
            contact_phone=f"+2547{rng.randint(10000000, 99999999)}",
            contact_country=country,
            line_items=[
                {
                    "label": "Adult",
                    "quantity": adults,
                    "unit_price": float(price.adult_price),
                    "amount": float(price.adult_price * adults),
                }
            ]
            + (
                [
                    {
                        "label": "Child",
                        "quantity": children,
                        "unit_price": float(unit_child),
                        "amount": float(unit_child * children),
                    }
                ]
                if children
                else []
            ),
            subtotal=total,
            total=total,
            deposit_amount=deposit,
            amount_paid=paid,
            balance=total - paid,
            payment_plan="deposit",
            balance_due_date=travel - timedelta(days=tour.balance_due_days),
            status=status,
            confirmed_at=created if paid else None,
            hold_expires_at=datetime.now(UTC) + timedelta(hours=6)
            if status == BookingStatus.pending_payment
            else None,
            source=rng.choice(["web", "web", "web", "whatsapp", "phone"]),
        )
        booking.created_at = created
        booking.travellers = [
            Traveller(
                full_name=booking.contact_name, traveller_type="adult", is_lead=True, nationality=country
            )
        ]
        db.add(booking)
        await db.flush()
        installments = (
            [paid]
            if status in (BookingStatus.fully_paid,) and rng.random() < 0.5
            else ([deposit, total - deposit] if paid == total else ([paid] if paid else []))
        )
        when = created
        for amount in installments:
            if amount <= 0:
                continue
            method = rng.choice(methods) if price.currency == "KES" else "card"
            online = ("mpesa", "airtel", "card")
            when = when + timedelta(days=rng.randint(0, 20))
            if when.date() > today:
                when = datetime.now(UTC) - timedelta(hours=rng.randint(1, 48))
            db.add(
                Payment(
                    reference="PY" + new_reference("X")[2:] + str(rng.randint(100, 999)),
                    booking_id=booking.id,
                    method=method,
                    provider="paystack" if method in online else "manual",
                    amount=amount,
                    currency=price.currency,
                    booking_amount=amount,
                    status=PaymentStatus.success,
                    phone=booking.contact_phone if method in ("mpesa", "airtel") else None,
                    receipt_number=f"{'TK' if method != 'card' else 'PSK'}{rng.randint(10**7, 10**8)}{i}",
                    # Typical Paystack Kenya pricing: ~1.5% mobile money, ~3% cards
                    gateway_fee=money(amount * Decimal("0.015" if method != "card" else "0.03"), "USD")
                    if method in online
                    else None,
                    platform_share=money(amount * settings.paystack_platform_percent / 100, "USD")
                    if method in online
                    else None,
                    paid_at=when,
                    created_at=when,
                    recorded_by_id=admin.id if method in ("bank", "cash") else None,
                    notes="Seed data",
                )
            )
    await db.flush()


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="wipe all data first")
    parser.add_argument("--no-demo", action="store_true", help="skip sample bookings and payments")
    parser.add_argument("--if-empty", action="store_true", help="do nothing if the database already has data")
    args = parser.parse_args()
    if args.reset:
        if settings.is_production:
            raise SystemExit("Refusing to reset a production database.")
        await reset_database()
    await seed(demo=not args.no_demo, if_empty=args.if_empty)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
