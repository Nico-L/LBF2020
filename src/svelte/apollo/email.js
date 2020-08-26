import { requeteGraphQL } from './gql.js'

export async function envoyerMail(variables) {
    const query = `
                mutation envoiMail($email: [String!]!, $template: String, $templateId: String) {
                    sendEmail(
                    from: "atelier@labonnefabrique.fr"
                    to: $email
                    templateId: $templateId
                    dynamic_template_data: $template
                    ) {
                    success
                    }
                }
            `
    return requeteGraphQL(query, variables)
        .then((resultats)=> {
            return resultats.insert_reservationMachines
        })
}

//templateId resa machine d-08bb9e1b96ac4d56a9210660cac6cd07
//templateId inscription atelier : d-3db7863e710b491e89681ccdf840a9f4