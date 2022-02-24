const https = require("https");
const baseUrl = "http://harley-davidson.com";

const fs = require("fs");
const request = require("request");
const { resolve } = require("path");

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const saveSpareParts = async (sparePartsArr) => {
    var download = function (uri, filename, directory, callback) {
        request.head(uri, function (err, body) {
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory);
            }
            request(uri)
                .pipe(fs.createWriteStream(`${directory}/${filename}`))
                .on("close", callback);
        });
    };
    for (const item of sparePartsArr) {
        var i = 1;
        for (const imageUrl of item.imageUrls) {
            await sleep(100); // Wait a second between each scrape. This is necessary to not send too many requests at a time
            download(
                `${baseUrl}${imageUrl}`,
                `img-${i}.png`,
                `images/${item.productCode}`,
                function () {
                    console.log(`Downloaded: ${imageUrl}`);
                }
            );
            i++;
        }
    }
};

const fetchItemsWithPagination = async (itemsPerRequest, page) => {
    const url = `https://www.harley-davidson.com/search/?format=json;i=1;locale=da_DK;page=${page};q1=parts;q2=motorcycle-parts;sp_c=${itemsPerRequest};x1=primaryCategoryCode;x2=superCategoryCodes;sp_cs=UTF-8`;
    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = [];
            res.on("data", (chunk) => {
                data.push(chunk);
            });

            res.on("end", () => {
                const parts = JSON.parse(Buffer.concat(data).toString());
                const pagination = parts.pagination[0];
                const pickedPartsArr = parts.resultsets[0].results;
                const fetchedItemsArr = [];
                for (const item of pickedPartsArr) {
                    let imageUrls = [
                        `${item.primaryThumbnailUrl}`,
                        `${item.hoverThumbnailUrl}`,
                    ].filter((x) => x !== "");

                    fetchedItemsArr.push({
                        name: item.formattedName,
                        description: item.description,
                        productCode: item.baseProductCode,
                        imageUrls: imageUrls,
                    });
                }

                resolve({
                    pagination: {
                        current: pagination.current,
                        next: pagination.next,
                        previous: pagination.previous,
                        last: pagination.last,
                    },
                    results: fetchedItemsArr,
                });
            });
        });
    });
};

function millisToMinutesAndSeconds(millis) {
    var minutes = Math.floor(millis / 60000);
    var seconds = ((millis % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
}

(async () => {
    console.log("Scraping...");
    var startTime = Date.now();
    let resultsArr = [];
    let hasNextPage = true;
    let page = 1;
    while (hasNextPage) {
        const newCall = await fetchItemsWithPagination(500, page);
        console.log(`Fetching items from page: ${page}`);
        resultsArr = resultsArr.concat(newCall.results);
        if (newCall.pagination.next.length <= 2) {
            hasNextPage = false;
        }
        page++;
    }

    fs.writeFile(
        "scrapedData.json",
        JSON.stringify(resultsArr),
        function (err) {
            if (err) throw err;
        }
    );

    await saveSpareParts(resultsArr);
    let elapsed = Date.now() - startTime;
    await sleep(1500);
    console.log("Finished in", millisToMinutesAndSeconds(elapsed) + " minutes");
})();
