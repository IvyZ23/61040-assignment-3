/**
 * PlanItinerary Concept - AI Augmented Version
 * Purpose: Manage trip itineraries with event proposals, approvals, and AI-based suggestions.
 */

import { GeminiLLM } from "./gemini-llm";

export interface Trip {
    destination: string;
    startDate: string; // ISO date
    endDate: string; // ISO date
    groupSize: number;
}

export interface Event {
    name: string;
    cost: number;
    start: string; // ISO date
    end: string; // ISO date
    location: string;
    pending: boolean;
    approved: boolean;
}

export interface Itinerary {
    trip: Trip;
    events: Event[];
    finalized: boolean;
    budget: number;
}

export interface Suggestion {
    name: string;
    cost: number;
    category: string;
    location: string;
    durationHours: number;
}

export class PlanItinerary {
    private itineraries: Itinerary[] = [];

    /**
     * Create a new itinerary for a trip
     */
    create(trip: Trip, budget: number): Itinerary {
        const existing = this.itineraries.find((i) => i.trip === trip);
        if (existing)
            throw new Error("An itinerary for this trip already exists.");

        const itinerary: Itinerary = {
            trip,
            events: [],
            finalized: false,
            budget,
        };

        this.itineraries.push(itinerary);
        return itinerary;
    }

    /**
     * Add an event (pending approval)
     */
    addEvent(
        name: string,
        cost: number,
        location: string,
        itinerary: Itinerary,
        start: string,
        end: string
    ): Event {
        const event: Event = {
            name,
            cost,
            location,
            start,
            end,
            pending: true,
            approved: false,
        };
        itinerary.events.push(event);
        return event;
    }

    /**
     * Update an existing event
     */
    updateEvent(
        event: Event,
        name: string,
        cost: number,
        start: string,
        end: string
    ): void {
        event.name = name;
        event.cost = cost;
        event.start = start;
        event.end = end;
    }

    /**
     * Approve or disapprove an event
     */
    setEventApproval(event: Event, approved: boolean): void {
        event.approved = approved;
        event.pending = false;
    }

    /**
     * Finalize itinerary
     */
    finalizeItinerary(itinerary: Itinerary, finalized: boolean): void {
        itinerary.finalized = finalized;
    }

    /**
     * Calculate remaining budget (based only on approved events)
     */
    getRemainingBudget(itinerary: Itinerary): number {
        const spent = itinerary.events
            .filter((e) => e.approved)
            .reduce((sum, e) => sum + e.cost, 0);
        return itinerary.budget - spent;
    }

    /**
     * Generate LLM suggestions based on trip details and remaining budget
     */
    async requestSuggestionFromLLM(
        itinerary: Itinerary,
        llm: GeminiLLM
    ): Promise<Suggestion[]> {
        const { destination } = itinerary.trip;
        const remainingBudget = this.getRemainingBudget(itinerary);

        const approvedEvents = itinerary.events.filter((e) => e.approved);

        // console.log(
        //     "Approved events:",
        //     JSON.stringify(approvedEvents, null, 2)
        // );

        const prompt = `
You are an travel planner AI helping users plan trips.
Your task is to suggest attractions or dining locations in the destination that fit within this budget.

Trip Information:
- Trip destination: ${destination}
- Trip time frame: ${itinerary.trip.startDate} to ${itinerary.trip.endDate}
- Remaining group budget: $${remainingBudget.toFixed(2)}
- Here are the already approved events: ${
            approvedEvents.length > 0 ? JSON.stringify(approvedEvents) : "None"
        }

- Destination reasoning rules:
    1. If the destination name "${destination}" clearly refers to a real place , use that as the location for all suggestions.
    2. If the destination name is vague or unclear, DO NOT assume a location.
       - Instead, look at the approved events listed above. 
       - If at least one approved event exists, use the location(s) of those approved events as the trip destination.
    3. If and only if there are no approved events AND the destination is vague, respond with:
       {
         "error": "Unable to determine destination."
       }
    4. In all other cases, only suggest locations that are within the determined destination.

REQUIREMENTS
- Suggest a mix of restaurants, cultural spots, and affordable activities.
- Each suggestion should fit within the remaining budget.
- Be something meaningful to do on a vacation, not a trivial or one-off task.
- Each suggestion must be specific and actionable, not vague or generic. If suggesting dining or shopping, name a specific place or experience that is well-known or typical for the destination.
- If the current itinerary already contains long or full-day activities, only suggest additional activities that are short (1 hour or less). Each suggestion must include a realistic "durationHours" value that fits into the remaining available time.
- Return 5 suggestions at most

Each activity must be represented strictly as a valid JSON object following this schema:
{
  "name": "string — the name of the activity",
  "cost": number — approximate cost in USD,
  "category": "string — e.g. Sightseeing, Dining, Museum, Outdoor, Cultural, etc.",
  "location": "string — city and country where the activity occurs",
  "durationHours": number — approximate number of hours the activity takes
}

If an error was to be returned, return it as a JSON object:
{
  "error": "string — error message"
}

DO NOT include any explanations or text outside the JSON array.
        `;

        try {
            const text = await llm.executeLLM(prompt);
            // console.log(text);
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) throw new Error(JSON.stringify(text));

            const suggestions: Suggestion[] = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(suggestions))
                throw new Error("Invalid suggestions format.");
            const validated: Suggestion[] = validateAllSuggestions(
                suggestions,
                itinerary.events,
                destination,
                remainingBudget
            );
            if (!validated)
                throw new Error("No valid suggestions after validation.");
            return validated;
        } catch (error) {
            console.error("❌ LLM suggestion error:", (error as Error).message);
            return [];
        }
    }
}

// Validators

// Check if suggestion location matches trip destination or existing event locations
function validateDestination(
    suggestion: Suggestion,
    destination: string,
    events: Event[]
): boolean {
    if (!suggestion.location) return false;

    const normalize = (text: string) =>
        text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .trim();

    const normalizedDest = normalize(destination);
    const suggestionText = normalize(suggestion.location || "");

    const matchesDestination = suggestionText.includes(normalizedDest);

    const itineraryLocations = events
        .map((e) => normalize(e.location || ""))
        .filter((loc) => loc.length > 0);

    const matchesExistingLocation = itineraryLocations.some((loc) =>
        suggestionText.includes(loc)
    );

    return matchesDestination || matchesExistingLocation;
}

// Check if suggestion cost fits within remaining budget
function validateBudget(
    // events: Event[],
    suggestion: Suggestion,
    budget: number
): boolean {
    return (suggestion.cost || 0) <= budget;
}

// Check for duplicate suggestions based on name
function isDuplicate(events: Event[], suggestion: Suggestion): boolean {
    return events.some(
        (e) => e.name.toLowerCase() === suggestion.name.toLowerCase()
    );
}

// Validate all suggestions and filter out invalid ones
function validateAllSuggestions(
    suggestions: Suggestion[],
    events: Event[],
    destination: string,
    budget: number
): Suggestion[] {
    const validSuggestions: Suggestion[] = [];

    console.log("\n🔍 Validating LLM Suggestions...");
    console.log("================================");

    for (const suggestion of suggestions) {
        const issues: string[] = [];

        if (!validateDestination(suggestion, destination, events)) {
            issues.push("Destination mismatch");
        }

        if (!validateBudget(suggestion, budget)) {
            issues.push("Exceeds remaining budget");
        }

        if (isDuplicate(events, suggestion)) {
            issues.push("Duplicate of existing event");
        }

        if (issues.length > 0) {
            console.warn(
                `❌ Rejected "${suggestion.name}": ${issues.join("; ")}`
            );
        } else {
            console.log(`✅ Accepted "${suggestion.name}"`);
            validSuggestions.push(suggestion);
        }
    }

    console.log(
        `\n✨ Validation complete: ${validSuggestions.length}/${suggestions.length} valid suggestions.`
    );

    return validSuggestions;
}
