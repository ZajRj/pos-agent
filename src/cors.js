/**
 * CORS Configuration Factory
 * @param {object} config 
 * @returns {object} CORS Options
 */
module.exports = (config) => ({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // HARDCODED: Always allow localhost/127.0.0.1 to prevent lockout
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
        }

        // If allowed_origins is defined in config, enforce it
        if (config.allowed_origins && Array.isArray(config.allowed_origins) && config.allowed_origins.length > 0) {
            if (config.allowed_origins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                console.warn(`Blocked CORS request from: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        } else {
            // Default: Allow all if not configured
            callback(null, true);
        }
    }
});
