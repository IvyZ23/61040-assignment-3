/**
 * PlanItinerary Test Cases
 *
 * Demonstrates both manual event planning and LLM-augmented itinerary generation.
 * Tests for robustness under missing data, extreme budgets, and vague trip info.
 */

import { PlanItinerary, Trip } from "./itinerary";
import { GeminiLLM, Config } from "./gemini-llm";

/**
 * Helper: Load config.json for LLM API key
 */
function loadConfig(): Config {
    try {
        const config = require("../config.json");
        return config;
    } catch (error) {
        console.error(
            "❌ Error loading config.json. Please ensure it exists with your API key."
        );
        process.exit(1);
    }
}

/**
 * Test case 1: Basic manual itinerary creation
 */
export async function testManualItinerary(): Promise<void> {
    console.log("\n🧪 TEST CASE 1: Manual Itinerary Creation");
    console.log("===========================================");

    const planner = new PlanItinerary();
    const trip: Trip = {
        destination: "Kyoto, Japan",
        startDate: "2025-04-01",
        endDate: "2025-04-07",
        groupSize: 2,
    };
    const itinerary = planner.create(trip, 1500);

    console.log("📝 Adding a few planned events manually...");
    planner.addEvent(
        "Visit Fushimi Inari Shrine",
        100,
        "Kyoto, Japan",
        itinerary,
        "2025-04-02T09:00:00Z",
        "2025-04-02T10:00:00Z"
    );
    planner.addEvent(
        "Try matcha desserts in Gion",
        30,
        "Kyoto, Japan",
        itinerary,
        "2025-04-02T15:00:00Z",
        "2025-04-02T16:00:00Z"
    );

    itinerary.events.forEach((e) => planner.setEventApproval(e, true));

    console.log("\n✅ Finalized itinerary:");
    console.log(itinerary);
}

/**
 * Test case 2: LLM suggestion for a normal, well-defined trip
 */
export async function testLLMSuggestions(): Promise<void> {
    console.log("\n🧪 TEST CASE 2: LLM Suggestion Generation");
    console.log("===========================================");

    const config = loadConfig();
    const llm = new GeminiLLM(config);
    const planner = new PlanItinerary();

    const trip: Trip = {
        destination: "Rome, Italy",
        startDate: "2025-06-01",
        endDate: "2025-06-14",
        groupSize: 4,
    };
    const itinerary = planner.create(trip, 2500);

    planner.addEvent(
        "Colosseum Tour",
        150,
        "Rome, Italy",
        itinerary,
        "2025-06-03T10:00:00Z",
        "2025-06-03T12:00:00Z"
    );
    planner.setEventApproval(itinerary.events[0], true);

    console.log("💡 Requesting LLM suggestions...");
    const suggestions = await planner.requestSuggestionFromLLM(itinerary, llm);

    console.log("\n📍 AI Suggestions:", JSON.stringify(suggestions, null, 2));
}

/**
 * Test case 3: Ambiguous trip destination (challenge case)
 * Expectation: LLM may produce irrelevant or inconsistent results
 */
export async function testAmbiguousDestination(): Promise<void> {
    console.log(
        "\n🧪 TEST CASE 3: Ambiguous Destination with Events Already in Itinerary"
    );
    console.log("======================================");

    const config = loadConfig();
    const llm = new GeminiLLM(config);
    const planner = new PlanItinerary();

    const trip: Trip = {
        destination: "Spring Break",
        startDate: "2025-03-10",
        endDate: "2025-03-17",
        groupSize: 1,
    };
    const itinerary = planner.create(trip, 1200);

    planner.addEvent(
        "Colosseum Tour",
        150,
        "Rome, Italy",
        itinerary,
        "2025-06-03T10:00:00Z",
        "2025-06-03T12:00:00Z"
    );
    planner.setEventApproval(itinerary.events[0], true);

    console.log("💡 Requesting LLM suggestions for vague trip...");
    const suggestions = await planner.requestSuggestionFromLLM(itinerary, llm);

    console.log("\n📍 AI Suggestions:", JSON.stringify(suggestions, null, 2));
}

export async function testAmbiguousDestinationEmpty(): Promise<void> {
    console.log("\n🧪 TEST CASE 4: Ambiguous Destination with Empty Itinerary");
    console.log("======================================");

    const config = loadConfig();
    const llm = new GeminiLLM(config);
    const planner = new PlanItinerary();

    const trip: Trip = {
        destination: "Spring Break",
        startDate: "2025-03-10",
        endDate: "2025-03-17",
        groupSize: 1,
    };
    const itinerary = planner.create(trip, 1200);

    console.log("💡 Requesting LLM suggestions for vague trip...");
    const suggestions = await planner.requestSuggestionFromLLM(itinerary, llm);

    console.log("\n📍 AI Suggestions:", JSON.stringify(suggestions, null, 2));
}

/**
 * Test case 4: Unrealistic budget constraints (too low)
 * Expectation: AI should handle gracefully or return minimal-cost options
 */
export async function testLowBudget(): Promise<void> {
    console.log("\n🧪 TEST CASE 5: Extremely Low Budget");
    console.log("====================================");

    const config = loadConfig();
    const llm = new GeminiLLM(config);
    const planner = new PlanItinerary();

    const trip: Trip = {
        destination: "Paris, France",
        startDate: "2025-07-01",
        endDate: "2025-07-10",
        groupSize: 1,
    };
    const itinerary = planner.create(trip, 15); // absurdly low budget

    console.log("💡 Requesting LLM suggestions with $15 budget...");
    const suggestions = await planner.requestSuggestionFromLLM(itinerary, llm);

    console.log("\n📍 AI Suggestions:", JSON.stringify(suggestions, null, 2));
}

/**
 * Test case 5: Conflict — itinerary already full but AI still asked for suggestions
 */
export async function testFullItineraryConflict(): Promise<void> {
    console.log("\n🧪 TEST CASE 6: Full Itinerary Conflict");
    console.log("========================================");

    const config = loadConfig();
    const llm = new GeminiLLM(config);
    const planner = new PlanItinerary();

    const trip: Trip = {
        destination: "New York City, USA",
        startDate: "2025-12-20",
        endDate: "2025-12-21",
        groupSize: 4,
    };
    const itinerary = planner.create(trip, 2000);

    // Simulate full itinerary
    // for (let i = 0; i < 10; i++) {
    //     const event = planner.addEvent(
    //         `Activity ${i + 1}`,
    //         150,
    //         itinerary,
    //         `2025-12-${20 + i}T10:00:00Z`
    //     );
    //     planner.setEventApproval(event, true);
    // }

    const event = planner.addEvent(
        `Event that takes up most of the day`,
        150,
        "New York City, USA",
        itinerary,
        `2025-12-20T00:00:00Z`,
        `2025-12-20T23:00:00Z`
    );
    planner.setEventApproval(event, true);

    console.log(
        "💡 Requesting more LLM suggestions for already full itinerary..."
    );
    const suggestions = await planner.requestSuggestionFromLLM(itinerary, llm);

    console.log("\n📍 AI Suggestions:", JSON.stringify(suggestions, null, 2));
}

/**
 * Main function to run all test cases
 */
async function main(): Promise<void> {
    console.log("🎓 PlanItinerary Test Suite");
    console.log("=============================\n");

    try {
        await testManualItinerary();
        await testLLMSuggestions();
        await testAmbiguousDestination();
        await testAmbiguousDestinationEmpty();
        await testLowBudget();
        await testFullItineraryConflict();

        console.log("\n🎉 All test cases completed.");
    } catch (error) {
        console.error("❌ Test error:", (error as Error).message);
        process.exit(1);
    }
}

// Run the tests directly
if (require.main === module) {
    main();
}
