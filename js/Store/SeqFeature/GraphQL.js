/**
 * Store that gets data from any set of web services that implement
 * the JBrowse REST API.
 */
define([
           'dojo/_base/declare',
           'dojo/request',
           'JBrowse/Store/SeqFeature/REST'
       ],
       function(
           declare,
           dojoRequest,
           REST
       ) {

return declare( REST,
{
    _post: function( request, callback, errorCallback ) {
        var thisB = this;
        dojoRequest(
            request.url,
            {
                method: 'POST',
                handleAs: 'json',
                data: request.data,
             }
        ).then(
            callback,
            this._errorHandler( errorCallback )
         );

    },

    getGlobalStats: function( callback, errorCallback ) {
        var query = `
            {
            findFeatures(argorgname:"${this.refSeq.organism}",argrefseq:"${this.refSeq.name}", argsotype:"gene", argfmin:1, argfmax:100000) { totalCount }
            }
        `;
        this._post({
            url: this.baseUrl + 'graphql',
            data: {
                operationName: null,
                query: query,
                variables: "",
            }
        }, function(resp){
            // TODO: process and call callback on that processed data
            var fixedData = {
                "featureDensity": 0.001,
                "featureCount": resp.data.findFeatures.totalCount,
            }
            callback(fixedData);
        }, errorCallback );
    },

    _mapNode: function(node){
        if (node.cvtermByTypeId.name == 'polypeptide'){
            return undefined;
        }
        // Basic attribtues
        var type = node.cvtermByTypeId.name;
        // Hack to make yeast data look nice...
        var f = {
            'uniqueID': node.uniquename,
            'name': node.name,
            'description': 'None',
            'source': 'exonerate',
            'type': type,
            'isAnalysis': node.isAnalysis,
            'isObsolete': node.isObsolete,
            'uniquename': node.uniquename,
        }

        // Location
        var floc = node.featurelocsByFeatureId.nodes[0];
        f.start = floc.fmin;
        f.end = floc.fmax;
        f.strand = floc.strand;

        var thisB = this;
        // subfeatures
        f.subfeatures = node.featureRelationshipsByObjectId.edges.map(function(x){
            return thisB._mapNode(x.node.featureBySubjectId);
        }).filter(function(x){ return x !== undefined })

        return f;
    },

    // The only difference in this code is query.organism is automatically set. The rest is 100% as-is from REST.js
    getFeatures: function( queryParams, featureCallback, endCallback, errorCallback ) {
        var organismName = "",
            refseqName = "",
            query = "";
        var thisB = this;

        if(queryParams.reference_sequences_only){
            // 1-based indexing used in substring in postgres
            queryParams.start += 1;
            queryParams.end   += 1;

            // This one is a special snowflake
            if(queryParams.start < 0){
                queryParams.start = queryParams.start + 3;
                queryParams.end = queryParams.end + 0;
            }

            // Then shift back to 0-based indexing
            queryParams.rstart = queryParams.start - 1;
            queryParams.rend = queryParams.end - 1;

            realQstart = queryParams.start;
            realQlen = queryParams.end - queryParams.start + 1;
            var query = `{sequence: findSequence(argorgname:"${this.refSeq.organism}",argrefseq:"${this.refSeq.name}", argfmin: ${realQstart}, argflen: ${realQlen})}`;

        } else {
            var query = `{
  findFeatures(argorgname:"${this.refSeq.organism}",argrefseq:"${this.refSeq.name}", argsotype:"gene", argfmin: ${queryParams.start}, argfmax: ${queryParams.end}) {
    edges {
      node {
      ...featProps
        featureRelationshipsByObjectId {
          edges {
            node {
              featureBySubjectId {
                ...featProps
                featureRelationshipsByObjectId {
                  edges {
                    node {
                      featureBySubjectId {
                        ...featProps
                        featureRelationshipsByObjectId {
                          edges {
                            node {
                              featureBySubjectId {
                                ...featProps
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

fragment featProps on Feature {
  name
  dbxrefId
  uniquename
  cvtermByTypeId {
    name
  }
  isAnalysis
  isObsolete
  featurelocsByFeatureId {
    nodes {
      fmax
      fmin
      strand
      isFminPartial
      isFmaxPartial
    }
  }
}
`;

        }

        var thisB = this;
        this._post({
            url: this.baseUrl + 'graphql',
            data: {
                operationName: null,
                query: query,
                variables: "",
            }
        }, function(resp){
            var featureData;
            if(queryParams.reference_sequences_only){
                featureData = [
                    {'seq': resp.data.sequence, 'start': queryParams.rstart, 'end': queryParams.rend}
                ];
                //console.log(resp.data.sequence, queryParams.start, queryParams.end, queryParams.rstart, queryParams.rend, '=', resp.data.sequence.length, query);
            } else {
                featureData = resp.data.findFeatures.edges.map(function(node){ return thisB._mapNode(node.node) }).filter(function(x){ return x !== undefined });
            }

            thisB._makeFeatures( featureCallback, endCallback, errorCallback, { features: featureData } );
        }, errorCallback);
    },
});
});
