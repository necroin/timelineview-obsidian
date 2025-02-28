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

function GetDataviewDateTimeNow() {
    const dataview = this.app.plugins.plugins.dataview;
    return dataview.api.luxon.DateTime.now();
}

function regexreplace(text, pattern, replacement) {
    const regex = new RegExp(pattern, "g");
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
    const year = date.year;
    const month = String(date.month).padStart(2, "0");
    const day = String(date.day).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function GetLastDaysByPeriod(period, futurePeriod) {
    const dates = [];
    const now = new Date();
    now.setDate(now.getDate() + Number(futurePeriod));

    for (let i = 0; i < Number(period) + Number(futurePeriod); i++) {
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
    const result = {};
    const lines = text.split("\n");
    for (const line of lines) {
        const kv = line.split(":");
        if (kv.length < 2) {
            continue;
        }
        let key = kv[0];
        let value = kv[1];

        key = key.trim();
        value = value.trim();

        if (key == "Tags") {
            const tags = value.split(",");
            for (const tagIndex in tags) {
                tags[tagIndex] = tags[tagIndex].trim();
            }
            value = tags;
        }

        result[key] = value;
    }

    if (result["Tags"] == null) {
        result["Tags"] = [];
    }

    if (result["FuturePeriod"] == null) {
        result["FuturePeriod"] = 0;
    }

    return result;
}

class Logger {
    constructor(options = {}, fields = []) {
        this.logLevel = options.logLevel || "info";
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
        };
        this.fields = fields;
    }

    log(level, ...data) {
        if (this.levels[level] <= this.levels[this.logLevel]) {
            const timestamp = new Date().toISOString();
            const fieldsString = this.fields.length > 0 ? `[${this.fields.join("] [")}]` : "";
            console.log(`[${timestamp}] [${level.toUpperCase()}] ${fieldsString}`, ...data);
        }
    }

    error(...data) {
        this.log("error", ...data);
    }

    warn(...data) {
        this.log("warn", ...data);
    }

    info(...data) {
        this.log("info", ...data);
    }

    debug(...data) {
        this.log("debug", ...data);
    }

    setLogLevel(level) {
        if (this.levels.hasOwnProperty(level)) {
            this.logLevel = level;
        } else {
            console.warn(`Unknown log level: ${level}`);
        }
    }

    withFields(...fields) {
        return new Logger({ logLevel: this.logLevel }, [...this.fields, ...fields]);
    }
}

class ViewProcessor extends obsidian.MarkdownRenderChild {
    constructor(app, plugin, source, element, logger) {
        super(element);
        this.app = app;
        this.plugin = plugin;
        this.source = source;
        this.element = element;
        this.logger = logger.withFields("view processor");
    }

    onload() {
        this.render(this.source, this.element);
        this.registerEvent(this.app.workspace.on("dataview:refresh-views", this.maybeRefresh));
        this.register(this.element.onNodeInserted(this.maybeRefresh));
    }

    maybeRefresh = () => {
        this.logger.info("refresh");
        this.render(this.source, this.element);
    };

    async render(source, element) {
        this.logger.info("render");

        const dataview = this.app.plugins.plugins.dataview;
        if (!dataview) {
            this.logger.error("Dataview plugin is not installed");
            return;
        }

        const args = ParseArguments(source);
        this.logger.info("arguments: ", args);

        let tasks = await dataview.api
            .pages(args.EventFind)
            .file.lists
            .filter(
                task =>
                    task[args.EventStartField] != null &&
                    task[args.EventStartField] >
                    GetDataviewDateTimeNow().minus({ days: args.Period })
            )
            .sort(task => task[args.EventStartField], "desc");
        if (args.Limit != null) {
            tasks = tasks.limit(args.Limit);
        }
        this.logger.info(`task count: ${tasks.length}`);

        let rowsCount = tasks.length;
        if (rowsCount < VIEW_MIN_ROWS_COUNT) {
            rowsCount = VIEW_MIN_ROWS_COUNT;
        }

        const days = GetLastDaysByPeriod(args.Period, args.FuturePeriod);
        this.logger.info(`days count: ${days.length}`);

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
            daysIndex[FormatDate(ParseDate(date))] = index;

            if (day == 1) {
                const monthItem = document.createElement("div");
                monthItem.className = "timeline-month";
                monthItem.innerText = month;
                monthItem.style.gridRow = monthElementRowOffset;
                monthItem.style.gridColumn = columnIndex;
                timelineContainer.appendChild(monthItem);
            }

            const dayItem = document.createElement("div");
            dayItem.className = "timeline-day";
            dayItem.innerText = day;
            dayItem.style.gridRow = dayElementRowOffset;
            dayItem.style.gridColumn = columnIndex;

            const dayBackgroundItem = document.createElement("div");
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

            const duration = Math.floor(eventEndDate.diff(eventStartDate, "days").days) + 1;
            const dayIndex = daysIndex[FormatDate(eventStartDate)] + 1;

            const eventItem = document.createElement("div");
            eventItem.className = "timeline-event";
            eventItem.style.gridRow = `${rowIndex}`;
            eventItem.style.gridColumn = `${dayIndex} / span ${duration}`;

            const eventItemText = document.createElement("span");
            eventItemText.innerText = regexreplace(task.text, "\\[.*\\]", "");
            eventItem.appendChild(eventItemText);

            for (const tag of args.Tags) {
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
    constructor(app, plugin, logger) {
        this.app = app;
        this.plugin = plugin;
        this.logger = logger.withFields("api");
    }

    view(source, element, component) {
        const processor = new ViewProcessor(
            this.app,
            this.plugin,
            source,
            element,
            this.logger
        );
        component.addChild(processor);
        processor.load();
    }
}

class TimelinePlugin extends obsidian.Plugin {
    logger = new Logger({ logLevel: "info" }, ["Timelineview"]);

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new GeneralSettingsTab(this.app, this, this.logger));
        this.api = new TimelineApi(this.app, this, this.logger);
        this.registerMarkdownCodeBlockProcessor(
            "timelineview",
            async (source, element, ctx) => this.api.view(source, element, ctx)
        );
        this.logger.info(`version ${this.manifest.version} loaded.`);
    }

    onunload() {
        this.logger.info(`version ${this.manifest.version} unloaded.`);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async updateSettings(settings) {
        Object.assign(this.settings, settings);
        await this.saveData(this.settings);
    }
}

class GeneralSettingsTab extends obsidian.PluginSettingTab {
    constructor(app, plugin, logger) {
        super(app, plugin);
        this.plugin = plugin;
        this.logger = logger.withFields('GeneralSettingsTab');
    }

    display() {
        this.containerEl.empty();
    }
}

module.exports = TimelinePlugin;
