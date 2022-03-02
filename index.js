const https = require("https");
const baseUrl = "http://harley-davidson.com";
const htmlEntity = require("html-entities");
const ObjectsToCsv = require("objects-to-csv");

const keepAliveAgent = new https.Agent({
    keepAlive: true,
    maxSockets: Infinity,
});

const fs = require("fs");
const request = require("request");

const rootImageDir = "images";

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const saveSparePartsImage = async (sparePartsArr) => {
    try {
        var download = function (uri, filename, directory, callback) {
            request.head(uri, function (err, body) {
                if (!fs.existsSync(rootImageDir)) {
                    fs.mkdirSync(rootImageDir);
                }
                request(uri)
                    .pipe(fs.createWriteStream(`${rootImageDir}/${filename}`))
                    .on("close", callback);
            });
        };
        for (const item of sparePartsArr) {
            var i = 1;
            for (const imageUrl of item.imageUrls) {
                await sleep(100); // Wait 100 ms between each scrape. This is necessary to not send too many requests at a time
                var path = require("path");
                download(
                    `${baseUrl}${imageUrl}`,
                    `${path.parse(imageUrl).base}.png`,
                    `${rootImageDir}/${item.productCode}`,
                    function () {
                        console.log(`Downloaded: ${imageUrl}`);
                    }
                );
                i++;
            }
        }
    } catch (error) {
        console.log(error.message);
    }
};

const getDataFromApi = async (url) => {
    try {
        return await new Promise((resolve) => {
            https.get(url, keepAliveAgent, (res) => {
                let data = [];
                res.on("data", (chunk) => {
                    data.push(chunk);
                });

                res.on("error", (e) => {
                    console.error(e);
                });

                res.on("end", () => {
                    resolve(JSON.parse(Buffer.concat(data).toString()));
                });
            });
        });
    } catch (error) {
        console.log(error.message);
    }
};

const fetchItemsWithPagination = async (itemsPerRequest, page) => {
    try {
        const url = `https://www.harley-davidson.com/search/?format=json;i=1;locale=da_DK;page=${page};q1=parts;q2=motorcycle-parts;sp_c=${itemsPerRequest};x1=primaryCategoryCode;x2=superCategoryCodes;sp_cs=UTF-8`;
        const parts = await getDataFromApi(url);
        const pagination = parts.pagination[0];
        const pickedPartsArr = parts.resultsets[0].results;
        const fetchedItemsArr = [];
        for (const item of pickedPartsArr) {
            await sleep(100); // Wait 100 ms between each scrape. This is necessary to not send too many requests at a time
            const extraDetails = await getDataFromApi(
                `https://www.harley-davidson.com/dk/da/api-commerce/product/${item.baseProductCode}/get-fitment`
            );
            let productDetail = "";
            if (extraDetails) {
                if (extraDetails.part !== undefined) {
                    if (extraDetails.part.hdFitmentCopy !== undefined) {
                        productDetail = extraDetails.part.hdFitmentCopy
                            ? extraDetails.part.hdFitmentCopy
                            : "";
                    }
                }
            }
            let imageUrls = [
                `${item.primaryThumbnailUrl}`,
                `${item.hoverThumbnailUrl}`,
            ].filter((x) => x !== "");

            fetchedItemsArr.push({
                productCode: item.baseProductCode,
                name: item.formattedName,
                description: htmlEntity.decode(item.description),
                details: productDetail,
                productUrl: `${baseUrl}${item.pdpProductUrl}`,
                primaryCategoryCode: htmlEntity.decode(item.parentCategoryCode),
                primaryCategoryName: htmlEntity.decode(item.parentCategoryName),
                subCategoryCode: htmlEntity.decode(item.categoryCode),
                subCategoryName: htmlEntity.decode(item.categoryName),
                imageUrls: imageUrls,
                date: new Date().toISOString().split("T")[0],
            });
            console.log(
                `Found product: ${item.baseProductCode} - ${item.formattedName}`
            );
        }

        return {
            pagination: {
                current: pagination.current,
                next: pagination.next,
                previous: pagination.previous,
                last: pagination.last,
            },
            results: fetchedItemsArr,
        };
    } catch (error) {
        console.log(error);
    }
};

const millisToMinutesAndSeconds = (millis) => {
    var minutes = Math.floor(millis / 60000);
    var seconds = ((millis % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
};

const saveDataAsJsonFile = async (data, dirAndFileName) => {
    try {
        return fs.writeFile(
            `${dirAndFileName}.json`,
            JSON.stringify(data),
            function (err) {
                if (err) throw err;
            }
        );
    } catch (error) {
        console.log(error.message);
    }
};

const saveDataAsCSVFile = async (data, dirAndFileName) => {
    try {
        const csv = new ObjectsToCsv(data);
        await csv.toDisk(`${dirAndFileName}.csv`);
        return csv.toString();
    } catch (error) {
        console.log(error.message);
    }
};

(async () => {
    try {
        console.log("Scraping... Please wait.");
        var startTime = Date.now();
        let resultsArr = [];
        let hasNextPage = true;
        let page = 1;
        while (hasNextPage) {
            console.log(`Fetching items from page: ${page}`);
            const newCall = await fetchItemsWithPagination(500, page);

            resultsArr = resultsArr.concat(newCall.results);
            if (newCall.pagination.next.length <= 2) {
                hasNextPage = false;
            }
            page++;
        }

        await saveDataAsJsonFile(resultsArr, "scraped_parts_json");
        await saveDataAsCSVFile(resultsArr, "scraped_parts_csv");
        await saveSparePartsImage(resultsArr);
        let elapsed = Date.now() - startTime;
        await sleep(3000);
        console.log(
            "Finished in",
            millisToMinutesAndSeconds(elapsed) + " minutes"
        );
    } catch (error) {
        console.log(error.message);
    }
})();
