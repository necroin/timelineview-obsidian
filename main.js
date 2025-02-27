var obsidian = require("obsidian");

const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

const VIEW_MIN_ROWS_COUNT = 10;

const DEFAULT_SETTINGS = {
    refreshInterval: 2500,
};

function regexreplace(text, pattern, replacement) {
    let regex = new RegExp(pattern, "g");
    return text.replace(regex, replacement).trim();
}

function IsWeekday(date) {
    const day = date.getDay();
    return day >= 1 && day <= 5;
}

function IsHoliday(date) {
    return !IsWeekday(date);
}

function ParseDate(date) {
    return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
    };
}

function FormatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function GetDataviewDateTimeNow() {
    const dataview = this.app.plugins.plugins.dataview;
    return dataview.api.luxon.DateTime.now();
}

function FormatDataviewDate(date) {
    const year = date.year;
    const month = String(date.month).padStart(2, "0");
    const day = String(date.day).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function GetLastDaysByPeriod(period, futureOffset) {
    const dates = [];
    const now = new Date();
    now.setDate(now.getDate() + Number(futureOffset));

    for (let i = 0; i < Number(period) + Number(futureOffset); i++) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        dates.push(date);
    }

    return dates;
}

function GetMonthName(date) {
    const monthIndex = date.getMonth();
    return MONTHS[monthIndex];
}

function ParseArguments(text) {
    let result = {};
    let lines = text.split("\n");
    for (let line of lines) {
        let kv = line.split(":");
        if (kv.length < 2) {
            continue;
        }
        let key = kv[0];
        let value = kv[1];

        key = key.trim();
        value = value.trim();

        if (key == "Tags") {
            let tags = value.split(",");
            for (let tagIndex in tags) {
                tags[tagIndex] = tags[tagIndex].trim();
            }
            value = tags;
        }

        result[key] = value;
    }

    if (result["Tags"] == null) {
        result["Tags"] = [];
    }

    if (result["FutureOffset"] == null) {
        result["FutureOffset"] = 0;
    }

    return result;
}

class ViewProcessor extends obsidian.MarkdownRenderChild {
    constructor(app, plugin, source, element) {
        super(element);
        this.app = app;
        this.plugin = plugin;
        this.source = source;
        this.element = element;
    }

    onload() {
        this.render(this.source, this.element);
        this.registerEvent(
            this.app.workspace.on("dataview:refresh-views", this.maybeRefresh)
        );
        this.register(this.element.onNodeInserted(this.maybeRefresh));
    }

    maybeRefresh = () => {
        console.log("refresh");
        this.render(this.source, this.element);
    };

    async render(source, element) {
        console.log("render timeline");

        const dataview = this.app.plugins.plugins.dataview;
        if (!dataview) {
            console.error("Dataview plugin is not installed");
            return;
        }

        const args = ParseArguments(source);
        console.log("arguments: ", args);

        let tasks = await dataview.api
            .pages(args.EventFind)
            .file.lists.filter(
                task =>
                    task[args.EventStartField] != null &&
                    task[args.EventStartField] >
                    GetDataviewDateTimeNow().minus({ days: args.Period })
            )
            .sort(task => task[args.EventStartField], "desc");
        if (args.Limit != null) {
            tasks = tasks.limit(args.Limit);
        }
        console.log(`task count: ${tasks.length}`);

        let rowsCount = tasks.length;
        if (rowsCount < VIEW_MIN_ROWS_COUNT) {
            rowsCount = VIEW_MIN_ROWS_COUNT;
        }

        const days = GetLastDaysByPeriod(args.Period, args.FutureOffset);
        console.log(`days count: ${days.length}`);

        const monthElementRowOffset = 1;
        const dayElementRowOffset = monthElementRowOffset + 1;
        const taskElementRowOffset = dayElementRowOffset + 1;

        rowsCount = rowsCount + dayElementRowOffset;

        const timelineContainer = document.createElement("div");
        timelineContainer.className = "timeline-container";
        timelineContainer.style.gridTemplateRows = `repeat(${rowsCount}, var(--grid-column-size))`;
        timelineContainer.style.gridTemplateColumns = `repeat(${days.length}, var(--grid-column-size))`;
        timelineContainer.replaceChildren();

        const daysIndex = {};
        for (let index = 0; index < days.length; index++) {
            const columnIndex = index + 1;

            const date = days[days.length - index - 1];
            const day = ParseDate(date).day;
            const month = GetMonthName(date);
            daysIndex[FormatDate(date)] = index;

            if (day == 1) {
                let monthItem = document.createElement("div");
                monthItem.className = "timeline-month";
                monthItem.innerText = month;
                monthItem.style.gridRow = monthElementRowOffset;
                monthItem.style.gridColumn = columnIndex;
                timelineContainer.appendChild(monthItem);
            }

            let dayItem = document.createElement("div");
            dayItem.className = "timeline-day";
            dayItem.innerText = day;
            dayItem.style.gridRow = dayElementRowOffset;
            dayItem.style.gridColumn = columnIndex;

            let dayBackgroundItem = document.createElement("div");
            dayBackgroundItem.className = "timeline-day-bg";
            dayBackgroundItem.style.gridRow = `${dayElementRowOffset} / span ${rowsCount}`;
            dayBackgroundItem.style.gridColumn = columnIndex;
            if (IsHoliday(date)) {
                dayBackgroundItem.style.backdropFilter = "invert(10%)";
            }

            timelineContainer.appendChild(dayBackgroundItem);
            timelineContainer.appendChild(dayItem);
        }

        tasks.forEach((task, taskIndex) => {
            const rowIndex = taskIndex + taskElementRowOffset;
            const eventStartDate = task[args.EventStartField];
            let eventEndDate = task[args.EventEndField];
            if (eventEndDate == null) {
                eventEndDate = GetDataviewDateTimeNow();
            }

            const duration =
                Math.floor(eventEndDate.diff(eventStartDate, "days").days) + 1;
            const dayIndex = daysIndex[FormatDataviewDate(eventStartDate)] + 1;

            const eventItem = document.createElement("div");
            eventItem.className = "timeline-event";
            eventItem.style.gridRow = `${rowIndex}`;
            eventItem.style.gridColumn = `${dayIndex} / span ${duration}`;

            const eventItemText = document.createElement("span");
            eventItemText.innerText = regexreplace(task.text, "\\[.*\\]", "");
            eventItem.appendChild(eventItemText);

            for (let tag of args.Tags) {
                const tagValue = task[tag];
                if (tagValue == null) continue;
                const tagItem = document.createElement("span");
                tagItem.className = "timeline-event-tag";
                tagItem.innerText = tagValue;
                eventItem.appendChild(tagItem);
            }

            timelineContainer.appendChild(eventItem);
        });

        element.empty();
        element.appendChild(timelineContainer);
        timelineContainer.scrollLeft = timelineContainer.scrollWidth;
    }

    onClose() {
        return Promise.resolve();
    }
}

class TimelineApi {
    constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
    }

    view(source, element, component) {
        const processor = new ViewProcessor(this.app, this.plugin, source, element);
        component.addChild(processor);
        processor.load();
    }
}

class TimelinePlugin extends obsidian.Plugin {
    settings;

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async updateSettings(settings) {
        Object.assign(this.settings, settings);
        await this.saveData(this.settings);
    }

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new GeneralSettingsTab(this.app, this));
        this.api = new TimelineApi(this.app, this);
        this.registerMarkdownCodeBlockProcessor(
            "timelineview",
            async (source, element, ctx) => this.api.view(source, element, ctx)
        );
    }

    onunload() {
        console.log(`Timelineview: version ${this.manifest.version} unloaded.`);
    }
}

class GeneralSettingsTab extends obsidian.PluginSettingTab {
    plugin;

    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        this.containerEl.empty();
    }
}

module.exports = TimelinePlugin;
