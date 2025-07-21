export const config = {
    runtime: 'edge',
};

export default async function handler(request: Request) {
    // Test catalog mapping from your payment processor
    const SQUARE_CATALOG_MAPPING = {
      packages: {
        'Starter': 'GNQP4YZH57MGVR265N4QA7QH',
        'Popular': 'MXDI5KGKHQE2G7MVWPGJWZIS', 
        'Dusty Rose': 'GKIADSF5IJQEAAKCIL2WXZEK',
        'Eternal': 'X2N4DL3YZBKJYAICCVYMSJ6Y'
      },
      addons: {
        'Custom USB Drive': 'SMW4WXZUAE6E5L3FTS76NC7Y',
        'Online Gallery & Backup': 'YJ3AGBF7MRHW2QQ6KI5DMSPG'
      },
      services: {
        'expedited': '37LXAW3CQ7ONF7AGNCYDWRRT',
        'rush': 'HSMOF4CINCKHVWUPCEN5ZBOU'
      }
    };

    return new Response(JSON.stringify({
        message: 'Catalog mapping test',
        mapping: SQUARE_CATALOG_MAPPING,
        environment: {
            NODE_ENV: process.env.NODE_ENV,
            hasSquareAccessToken: !!process.env.SQUARE_ACCESS_TOKEN,
            hasSquareLocationId: !!process.env.SQUARE_LOCATION_ID,
            hasSquareApiUrl: !!process.env.SQUARE_API_URL
        },
        timestamp: new Date().toISOString()
    }), {
        status: 200,
        headers: {'Content-Type': 'application/json'}
    });
}
